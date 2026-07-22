import re
from typing import List, Dict, Any
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

def clean_text(text: str) -> str:
    """
    Cleans raw FDA text by removing HTML tags, excess spaces, and formatting artifacts.
    """
    if not text:
        return ""
    # Remove HTML tags if any
    text = re.sub(r'<[^>]+>', '', text)
    # Remove bracketed citations or numbers e.g. [1], [2] or (1)
    text = re.sub(r'\[\d+\]', '', text)
    # Replace multiple spaces with a single space
    text = re.sub(r'[ \t]+', ' ', text)
    # Standardize newlines (no more than 2 consecutive newlines)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()

def process_label_data(label_data: Dict[str, Any]) -> List[Document]:
    """
    Cleans sections and splits them into chunks using RecursiveCharacterTextSplitter,
    preserving detailed metadata for each chunk.
    """
    drug_name = label_data["drug_name"]
    generic_name = label_data["generic_name"]
    setid = label_data["setid"]
    sections = label_data["sections"]
    
    # Initialize RecursiveCharacterTextSplitter
    # 800 characters chunk size with 150 characters overlap
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=800,
        chunk_overlap=150,
        length_function=len,
        separators=["\n\n", "\n", " ", ""]
    )
    
    all_chunks = []
    
    for section_name, section_text in sections.items():
        cleaned_text = clean_text(section_text)
        if not cleaned_text:
            continue
            
        # Create a document for splitter
        doc = Document(
            page_content=cleaned_text,
            metadata={
                "drug_name": drug_name,
                "generic_name": generic_name,
                "section_name": section_name,
                "source": "Official FDA Drug Label via openFDA",
                "doc_id": setid
            }
        )
        
        # Split document
        split_docs = splitter.split_documents([doc])
        
        # Make metadata cleaner and add section contextual tag inside the text content to help retrieval
        for i, split_doc in enumerate(split_docs):
            # Prepend contextual label header inside page_content so LLM knows exactly which drug & section it belongs to!
            header = f"Medication: {drug_name} | Section: {section_name.replace('_', ' ').title()}\nContent: "
            split_doc.page_content = header + split_doc.page_content
            
            # Enrich metadata
            split_doc.metadata["chunk_index"] = i
            
            all_chunks.append(split_doc)
            
    return all_chunks
