from typing import List, Dict, Any, Optional
from langchain_community.vectorstores import Chroma
from langchain_core.documents import Document
from backend.config import settings
from backend.embeddings import get_embedding_model

_vector_store = None

def get_vector_store() -> Chroma:
    """
    Returns the persistent Chroma vector store instance.
    Initializes it if not already done.
    """
    global _vector_store
    if _vector_store is None:
        embeddings = get_embedding_model()
        # Initialize LangChain Chroma DB with persistence
        _vector_store = Chroma(
            collection_name="medirag_labels",
            embedding_function=embeddings,
            persist_directory=settings.CHROMA_PATH
        )
    return _vector_store

def add_drug_chunks(chunks: List[Document]) -> None:
    """
    Adds chunks to the persistent Chroma DB.
    """
    db = get_vector_store()
    db.add_documents(chunks)
    print(f"Successfully added {len(chunks)} chunks to vector store.")

def delete_drug_chunks(drug_name: str) -> None:
    """
    Deletes all chunks associated with a specific drug name from Chroma.
    Useful for overwriting/updating a drug label.
    """
    db = get_vector_store()
    try:
        # Access underlying chroma client to delete by metadata
        collection = db._collection
        collection.delete(where={"drug_name": drug_name})
        print(f"Deleted existing chunks for {drug_name}")
    except Exception as e:
        print(f"Error deleting chunks for {drug_name}: {e}")

def delete_chunks_by_filename(filename: str) -> None:
    """
    Deletes all chunks associated with a specific original filename from Chroma.
    Useful to avoid duplicate chunks when re-ingesting a modified document.
    """
    db = get_vector_store()
    try:
        collection = db._collection
        collection.delete(where={"original_filename": filename})
        print(f"Deleted existing chunks for original filename: {filename}")
    except Exception as e:
        print(f"Error deleting chunks for original filename {filename}: {e}")

def search_similar_chunks(query: str, drug_name: Optional[str] = None, k: int = 4) -> List[Document]:
    """
    Performs semantic search in Chroma DB.
    If drug_name is provided, it filters the results to only include chunks of that drug
    (matching either the brand name or the generic name).
    """
    db = get_vector_store()
    
    # Configure search filter if drug name is specified
    search_filter = None
    if drug_name:
        search_filter = {
            "$or": [
                {"drug_name": drug_name},
                {"generic_name": drug_name}
            ]
        }
        
    return db.similarity_search(query, k=k, filter=search_filter)

def get_indexed_drugs() -> List[str]:
    """
    Retrieves a list of all unique medication brand and generic names currently indexed in the vector store.
    """
    db = get_vector_store()
    try:
        collection = db._collection
        results = collection.get(include=["metadatas"])
        metadatas = results.get("metadatas", [])
        
        drugs = set()
        for meta in metadatas:
            if meta:
                if "drug_name" in meta:
                    drugs.add(meta["drug_name"])
                if "generic_name" in meta:
                    drugs.add(meta["generic_name"])
                
        return sorted(list(drugs))
    except Exception as e:
        print(f"Error listing indexed drugs: {e}")
        return []
