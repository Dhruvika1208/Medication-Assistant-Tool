import sys
import os

# Ensure the project root is in the path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.data_loader import fetch_fda_label_data
from backend.document_processor import process_label_data
from backend.vector_store import add_drug_chunks, delete_drug_chunks, get_indexed_drugs

# Standard medications list for the application database
MEDICATIONS_TO_INDEX = [
    "Ibuprofen",
    "Amoxicillin",
    "Metformin",
    "Aspirin",
    "Lisinopril",
    "Omeprazole",
    "Atorvastatin",
    "Albuterol",
    "Gabapentin",
    "Acetaminophen",
    "Metoprolol",
    "Losartan",
    "Simvastatin"
]

def run_ingestion():
    print("[START] Starting MediRAG Data Ingestion Pipeline...")
    print(f"Target Medications to Index: {', '.join(MEDICATIONS_TO_INDEX)}\n")
    
    successful_count = 0
    
    for drug in MEDICATIONS_TO_INDEX:
        print(f"--------------------------------------------------")
        print(f"[*] Processing: {drug}...")
        
        # 1. Fetch data from openFDA API
        label_data = fetch_fda_label_data(drug)
        if not label_data:
            print(f"[ERROR] Failed to fetch FDA label data for '{drug}'. Skipping.")
            continue
            
        print(f"[OK] Fetched FDA label successfully.")
        print(f"   Brand: {label_data['drug_name']}")
        print(f"   Generic: {label_data['generic_name']}")
        print(f"   SetID: {label_data['setid']}")
        
        # 2. Clear old indexing for this drug to prevent duplicate duplicates
        delete_drug_chunks(label_data['drug_name'])
        
        # 3. Clean and split text into LangChain chunks
        chunks = process_label_data(label_data)
        if not chunks:
            print(f"[WARNING] No text sections extracted/processed for '{drug}'. Skipping.")
            continue
            
        print(f"[OK] Document chunking complete: {len(chunks)} chunks created.")
        
        # 4. Generate embeddings and store them in persistent ChromaDB
        print(f"[PENDING] Embedding chunks and writing to ChromaDB (this may take a few seconds)...")
        try:
            add_drug_chunks(chunks)
            print(f"[SUCCESS] Ingestion successful for '{drug}'!")
            successful_count += 1
        except Exception as e:
            print(f"[ERROR] Error indexing chunks for '{drug}' in ChromaDB: {e}")
            
    # Print indexing summary
    print("\n==================================================")
    print("[DONE] Ingestion Pipeline Finished!")
    print(f"Successfully indexed: {successful_count} / {len(MEDICATIONS_TO_INDEX)} medications.")
    
    indexed_drugs = get_indexed_drugs()
    print(f"Currently indexed drugs in ChromaDB: {indexed_drugs}")

    print("==================================================")

if __name__ == "__main__":
    run_ingestion()
