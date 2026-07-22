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
    Supports drug name normalization, metadata filtering, and automatic fallback search.
    """
    db = get_vector_store()
    
    # 1. Normalize and detect drug name
    target_drug = drug_name.strip() if drug_name and drug_name.strip() else None
    
    # If no explicit drug_name provided, try detecting from indexed drugs in query string
    if not target_drug:
        all_indexed = get_indexed_drugs()
        query_lower = query.lower()
        for d in all_indexed:
            if d.lower() in query_lower:
                target_drug = d
                break

    results_with_scores = []
    
    # 2. If target_drug is identified, attempt filtered search with normalized name variations
    if target_drug:
        name_variations = list(set([
            target_drug,
            target_drug.lower(),
            target_drug.upper(),
            target_drug.capitalize(),
            target_drug.title()
        ]))
        
        # Build filter condition for ChromaDB
        filter_conditions = []
        for var in name_variations:
            filter_conditions.append({"drug_name": var})
            filter_conditions.append({"generic_name": var})
            
        search_filter = {"$or": filter_conditions} if len(filter_conditions) > 1 else filter_conditions[0]
        
        try:
            raw_results = db.similarity_search_with_score(query, k=k, filter=search_filter)
            for doc, score in raw_results:
                results_with_scores.append({"doc": doc, "score": float(score)})
        except Exception as e:
            print(f"[VectorStore Warning] Filtered similarity search failed for '{target_drug}': {e}")
            
    # 3. Fallback: If no results found via filter (or no target drug), run unfiltered search
    if not results_with_scores:
        augmented_query = f"{target_drug} {query}" if target_drug and target_drug.lower() not in query.lower() else query
        try:
            raw_results = db.similarity_search_with_score(augmented_query, k=k)
            for doc, score in raw_results:
                # If target_drug was specified, verify chunk relevance
                doc_drug = (doc.metadata.get("drug_name") or doc.metadata.get("generic_name") or "").lower()
                if target_drug:
                    if target_drug.lower() in doc_drug or target_drug.lower() in doc.page_content.lower():
                        results_with_scores.append({"doc": doc, "score": float(score)})
                else:
                    results_with_scores.append({"doc": doc, "score": float(score)})
        except Exception as e:
            print(f"[VectorStore Error] Similarity search failed: {e}")

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
