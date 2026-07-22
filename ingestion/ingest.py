import os
import sys
import hashlib
from typing import List, Dict, Any

# Ensure project root is in the path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.append(BASE_DIR)

from backend.vector_store import get_vector_store, add_drug_chunks, delete_chunks_by_filename
from ingestion.parsers import (
    parse_fda_json,
    parse_txt,
    parse_pdf,
    clean_text,
    guess_medication_name
)
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

# Directory configurations
DATA_DIR = os.path.join(BASE_DIR, "backend", "data")
RAW_DRUG_LABELS_DIR = os.path.join(DATA_DIR, "raw", "drug_labels")
RAW_DOCUMENTS_DIR = os.path.join(DATA_DIR, "raw", "documents")

# Supported file formats
SUPPORTED_EXTENSIONS = {".json", ".txt", ".pdf"}

def get_file_hash(file_path: str) -> str:
    """
    Generate an MD5 hash of the file path for consistent document IDs.
    """
    return hashlib.md5(os.path.basename(file_path).encode("utf-8")).hexdigest()

def run_ingestion():
    print("==================================================")
    print("[START] Starting MediRAG Data Ingestion Pipeline...")
    print("==================================================")
    
    # 1. Setup Directories
    os.makedirs(RAW_DRUG_LABELS_DIR, exist_ok=True)
    os.makedirs(RAW_DOCUMENTS_DIR, exist_ok=True)
    
    # Stats counters
    stats = {
        "found": 0,
        "processed": 0,
        "skipped": 0,
        "failed": 0
    }
    
    # Track files currently on disk to clean up any orphaned database documents
    current_files_on_disk = set()
    
    # Initialize splitter
    # 800 characters chunk size with 150 characters overlap
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=800,
        chunk_overlap=150,
        length_function=len,
        separators=["\n\n", "\n", " ", ""]
    )
    
    # List all candidate files in the two raw folders
    files_to_process = []
    
    if os.path.exists(RAW_DRUG_LABELS_DIR):
        for f in os.listdir(RAW_DRUG_LABELS_DIR):
            fpath = os.path.join(RAW_DRUG_LABELS_DIR, f)
            if os.path.isfile(fpath):
                files_to_process.append((fpath, "official_fda"))
                
    if os.path.exists(RAW_DOCUMENTS_DIR):
        for f in os.listdir(RAW_DOCUMENTS_DIR):
            fpath = os.path.join(RAW_DOCUMENTS_DIR, f)
            if os.path.isfile(fpath):
                files_to_process.append((fpath, "manual_document"))
                
    stats["found"] = len(files_to_process)
    print(f"[*] Found {len(files_to_process)} candidate file(s) for ingestion.\n")
    
    for file_path, source_type in files_to_process:
        filename = os.path.basename(file_path)
        _, ext = os.path.splitext(filename)
        ext = ext.lower()
        
        current_files_on_disk.add(filename)
        
        print(f"--------------------------------------------------")
        print(f"[*] Processing: {filename} ({source_type.upper()})")
        
        if ext not in SUPPORTED_EXTENSIONS:
            print(f"[SKIP] Unsupported file format '{ext}' for file '{filename}'.")
            stats["skipped"] += 1
            continue
            
        chunks: List[Document] = []
        
        # --- Handle Official FDA JSON Labels ---
        if source_type == "official_fda":
            if ext != ".json":
                print(f"[SKIP] FDA Drug Label directory should only contain JSON files. Skipping {filename}.")
                stats["skipped"] += 1
                continue
                
            label_data = parse_fda_json(file_path)
            if not label_data:
                print(f"[FAIL] Could not parse FDA label JSON: {filename}")
                stats["failed"] += 1
                continue
                
            brand_name = label_data["drug_name"]
            generic_name = label_data["generic_name"]
            setid = label_data["setid"]
            sections = label_data["sections"]
            source_url = label_data["source_url"]
            doc_id = label_data["doc_id"]
            
            print(f"   Identified Medication: {brand_name} ({generic_name})")
            print(f"   Document SetID: {setid}")
            print(f"   Extracted Sections: {list(sections.keys())}")
            
            for section_name, section_text in sections.items():
                cleaned = clean_text(section_text)
                if not cleaned:
                    continue
                    
                # Create LangChain Document
                doc = Document(
                    page_content=cleaned,
                    metadata={
                        "drug_name": brand_name,
                        "generic_name": generic_name,
                        "section_name": section_name,
                        "source_type": "official_fda",
                        "source": "Official FDA Drug Label via openFDA",
                        "original_filename": filename,
                        "source_url": source_url,
                        "doc_id": doc_id
                    }
                )
                
                # Split section
                split_docs = splitter.split_documents([doc])
                
                # Prepend contextual label inside content to help search retrieval
                for i, split_doc in enumerate(split_docs):
                    header = f"Medication: {brand_name} | Section: {section_name.replace('_', ' ').title()}\nContent: "
                    split_doc.page_content = header + split_doc.page_content
                    split_doc.metadata["chunk_index"] = i
                    chunks.append(split_doc)
                    
        # --- Handle Local Custom Medication Documents ---
        else:
            text_content = ""
            if ext == ".txt":
                text_content = parse_txt(file_path)
            elif ext == ".pdf":
                text_content = parse_pdf(file_path)
            elif ext == ".json":
                # For manual JSON documents, check if we can read text fields
                try:
                    with open(file_path, "r", encoding="utf-8") as jf:
                        jdata = json.load(jf)
                    if isinstance(jdata, dict):
                        # Extract from 'content', 'text' or serialize the values
                        text_content = jdata.get("content") or jdata.get("text") or str(jdata)
                    else:
                        text_content = str(jdata)
                except Exception as e:
                    print(f"[FAIL] Error reading manual JSON {filename}: {e}")
                    stats["failed"] += 1
                    continue
                    
            if not text_content or not text_content.strip():
                print(f"[FAIL] Empty or unextractable content in local document {filename}")
                stats["failed"] += 1
                continue
                
            cleaned = clean_text(text_content)
            med_name = guess_medication_name(file_path)
            doc_id = get_file_hash(file_path)
            
            print(f"   Guessed Medication: {med_name}")
            print(f"   Character Count: {len(cleaned)}")
            
            doc = Document(
                page_content=cleaned,
                metadata={
                    "drug_name": med_name,
                    "generic_name": med_name,
                    "section_name": "general_reference",
                    "source_type": "manual_document",
                    "source": f"Manually Added: {filename}",
                    "original_filename": filename,
                    "source_url": "",
                    "doc_id": doc_id
                }
            )
            
            # Split document
            split_docs = splitter.split_documents([doc])
            
            # Prepend contextual label inside content
            for i, split_doc in enumerate(split_docs):
                header = f"Medication: {med_name} | Section: General Reference ({filename})\nContent: "
                split_doc.page_content = header + split_doc.page_content
                split_doc.metadata["chunk_index"] = i
                chunks.append(split_doc)
                
        # --- Save to ChromaDB ---
        if not chunks:
            print(f"[WARNING] No text chunks generated for '{filename}'.")
            stats["skipped"] += 1
            continue
            
        print(f"[*] Cleaving duplicates: Removing older chunks for '{filename}'...")
        delete_chunks_by_filename(filename)
        
        print(f"[*] Generating embeddings & inserting {len(chunks)} chunks...")
        try:
            add_drug_chunks(chunks)
            print(f"[SUCCESS] Successfully ingested '{filename}'!")
            stats["processed"] += 1
        except Exception as e:
            print(f"[FAIL] Error writing chunks to ChromaDB: {e}")
            stats["failed"] += 1
            
    # 5. Clean up stale/deleted files from the vector store
    print("\n--------------------------------------------------")
    print("[*] Running post-ingestion cleanup of orphaned database records...")
    db = get_vector_store()
    try:
        collection = db._collection
        results = collection.get(include=["metadatas"])
        metadatas = results.get("metadatas", [])
        
        stale_filenames = set()
        for meta in metadatas:
            if meta and "original_filename" in meta:
                fname = meta["original_filename"]
                if fname and fname not in current_files_on_disk:
                    stale_filenames.add(fname)
                    
        if stale_filenames:
            print(f"[*] Found {len(stale_filenames)} orphaned file record(s) in database to clean up.")
            for fname in stale_filenames:
                print(f"[-] Cleaning up stale file: {fname}")
                delete_chunks_by_filename(fname)
        else:
            print("[OK] Database is clean. No orphaned records found.")
    except Exception as e:
        print(f"[WARNING] Could not run post-ingestion database cleanup: {e}")
        
    print("\n==================================================")
    print("[DONE] Ingestion Pipeline Finished!")
    print(f"   Files Found:     {stats['found']}")
    print(f"   Files Processed: {stats['processed']}")
    print(f"   Files Skipped:   {stats['skipped']}")
    print(f"   Files Failed:    {stats['failed']}")
    print("==================================================")

if __name__ == "__main__":
    run_ingestion()
