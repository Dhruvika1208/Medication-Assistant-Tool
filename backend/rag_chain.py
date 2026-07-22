from typing import Dict, Any, List, Optional
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from backend.llm import get_llm
from backend.vector_store import search_similar_chunks

SYSTEM_PROMPT = """You are MediRAG, an AI Medication Information Assistant.
Your task is to answer medication-related questions using ONLY the provided medication context (which includes official FDA drug labels and trusted local documents).

---
RETRIEVED MEDICATION CONTEXT:
{context}
---

STRICT CLINICAL RULES:
1. Grounding: Answer the question using ONLY the provided context (FDA drug labels or trusted local documents). Do not use any outside knowledge, assumptions, or invent facts.
2. Insufficient Information: If the provided context does not contain enough information to answer the question, clearly state: "Sufficient information was not found in the available medication database."
3. No Diagnostics: Do not diagnose medical conditions under any circumstances.
4. No Treatment Prescriptions: Do not recommend specific, personalized treatment decisions or tell the user what they "should" take.
5. Seek Professional Advice: Always include a polite disclaimer at the end encouraging the user to consult their doctor or pharmacist for personalized medical advice, especially if they are asking about symptoms or treatment options.

Answer the question now using a professional, supportive healthcare tone. Include details from the context if found."""

def generate_grounded_answer(question: str, drug_name: Optional[str] = None) -> Dict[str, Any]:
    """
    Executes the RAG pipeline:
    1. Similarity search in ChromaDB.
    2. Constructs prompt context.
    3. Runs LangChain ChatGroq chain.
    4. Formats and returns answer with source metadata.
    """
    # Search ChromaDB
    # If a specific drug name was searched, restrict context retrieval to that drug's chunks.
    # Otherwise perform global lookup.
    chunks = search_similar_chunks(question, drug_name=drug_name, k=4)
    
    if not chunks:
        return {
            "answer": "Sufficient information was not found in the available FDA drug-label data. Please verify the medication name or ensure it has been ingested.",
            "sources": []
        }
        
    # Combine chunks for LLM context
    context_text = "\n\n".join([chunk.page_content for chunk in chunks])
    
    # Formulate LangChain chat prompt
    prompt = ChatPromptTemplate.from_messages([
        ("system", SYSTEM_PROMPT),
        ("human", "Question: {question}")
    ])
    
    # Execute LLM chain
    try:
        llm = get_llm()
        chain = prompt | llm | StrOutputParser()
        answer = chain.invoke({"context": context_text, "question": question})
    except Exception as e:
        print(f"RAG Chain LLM execution failed: {e}. Falling back to offline context extraction.")
        
        # Build offline fallback text using retrieved chunks
        bullet_points = []
        for chunk in chunks[:2]:
            cleaned_chunk_text = chunk.page_content.split("Content: ")[-1].strip()
            # truncate chunk text if extremely long
            if len(cleaned_chunk_text) > 350:
                cleaned_chunk_text = cleaned_chunk_text[:350] + "..."
            bullet_points.append(cleaned_chunk_text)
            
        bullets = "\n\n• ".join(bullet_points)
        answer = (
            f"**[Medication Information (Offline Fallback Mode)]**\n\n"
            f"• {bullets}\n\n"
            f"*Note: The primary AI generator is currently offline. The information above was retrieved directly from the local vector database. Always seek the advice of a qualified healthcare provider with any questions you may have regarding a medical condition.*"
        )
        
    # Format and deduplicate sources
    sources = []
    seen_sources = set()
    for chunk in chunks:
        med_name = chunk.metadata.get("drug_name") or "General"
        section = chunk.metadata.get("section_name") or "General"
        source_id = f"{med_name}_{section}_{chunk.metadata.get('original_filename', '')}_{chunk.metadata.get('chunk_index', 0)}"
        if source_id not in seen_sources:
            seen_sources.add(source_id)
            
            # Clean up section name
            section_display = section.replace("_", " ").title()
            
            # Extract content from chunk, excluding prepended header
            raw_content = chunk.page_content
            if "Content: " in raw_content:
                raw_content = raw_content.split("Content: ", 1)[-1]
                
            sources.append({
                "drug_name": med_name,
                "section_name": section_display,
                "source_text": raw_content.strip(),
                "source": chunk.metadata.get("source") or "Medication Document",
                "doc_id": chunk.metadata.get("doc_id") or "",
                "source_type": chunk.metadata.get("source_type") or "official_fda",
                "source_url": chunk.metadata.get("source_url") or "",
                "original_filename": chunk.metadata.get("original_filename") or ""
            })
            
    return {
        "answer": answer,
        "sources": sources
    }
