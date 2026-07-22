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

def search_similar_chunks(query: str, drug_name: Optional[str] = None, k: int = 8) -> List[Dict[str, Any]]:
    """
    Performs semantic search in Chroma DB.
    Returns a list of dicts with 'doc' (Document) and 'score' (float).
    Supports drug name normalization, substring matching against indexed names, and fallback search.
    """
    db = get_vector_store()
    all_indexed = get_indexed_drugs()
    
    # 1. Normalize and detect drug name
    target_drug = drug_name.strip() if drug_name and drug_name.strip() else None
    
    if not target_drug:
        query_lower = query.lower()
        for d in all_indexed:
            if d.lower() in query_lower:
                target_drug = d
                break

    results_with_scores = []
    
    # 2. Match target_drug against all indexed drug names in ChromaDB (case-insensitive substring match)
    if target_drug:
        target_lower = target_drug.lower()
        matching_names = set()
        
        for d in all_indexed:
            if target_lower in d.lower():
                matching_names.add(d)
                
        # Also add common casing variations of target_drug
        matching_names.add(target_drug)
        matching_names.add(target_drug.lower())
        matching_names.add(target_drug.upper())
        matching_names.add(target_drug.title())
        
        # Build filter condition for ChromaDB
        filter_conditions = []
        for name in matching_names:
            filter_conditions.append({"drug_name": name})
            filter_conditions.append({"generic_name": name})
            
        search_filter = {"$or": filter_conditions} if len(filter_conditions) > 1 else filter_conditions[0]
        
        try:
            raw_results = db.similarity_search_with_score(query, k=k, filter=search_filter)
            for doc, score in raw_results:
                results_with_scores.append({"doc": doc, "score": float(score)})
        except Exception as e:
            print(f"[VectorStore Warning] Substring filtered search failed for '{target_drug}': {e}")
            
    # 3. Fallback: If filtered search returned empty, perform unfiltered similarity search
    if not results_with_scores:
        augmented_query = f"{target_drug} {query}" if target_drug and target_drug.lower() not in query.lower() else query
        try:
            raw_results = db.similarity_search_with_score(augmented_query, k=k)
            for doc, score in raw_results:
                doc_drug = (doc.metadata.get("drug_name") or doc.metadata.get("generic_name") or "").lower()
                doc_content = doc.page_content.lower()
                if target_drug:
                    target_lower = target_drug.lower()
                    if target_lower in doc_drug or target_lower in doc_content:
                        results_with_scores.append({"doc": doc, "score": float(score)})
                else:
                    results_with_scores.append({"doc": doc, "score": float(score)})
        except Exception as e:
            print(f"[VectorStore Error] Unfiltered fallback search failed: {e}")

    return results_with_scores

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
