import logging
from typing import Dict, Any, List, Optional
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from backend.llm import get_llm
from backend.vector_store import search_similar_chunks

logger = logging.getLogger("backend.rag_chain")

SYSTEM_PROMPT = """You are MediRAG, an AI Medication Information Assistant.
Your task is to answer medication-related questions using ONLY the provided medication context (official FDA drug labels and trusted local documents).

---
RETRIEVED MEDICATION CONTEXT:
{context}
---

FORMATTING & RESPONSE GUIDELINES:
1. Simple & Clear Language: Explain medical concepts in clear, simple, user-friendly language suitable for a patient or caregiver. If complex medical terminology must be used, briefly explain it in plain English.
2. Structured Layout:
   - Use short paragraphs and bullet points (e.g. "• Nausea").
   - Use clear headers when appropriate (e.g., "### Common side effects", "### Serious side effects", "### Warnings", "### Storage Instructions", "### Contraindications").
3. Side Effects Questions:
   - If asked about side effects, separate common/minor reactions under a heading "Common side effects" and severe/life-threatening reactions under a heading "Serious side effects" (if the retrieved context supports this distinction).
   - Do NOT mix common and serious side effects together.
4. Strictly Grounded: Answer using ONLY facts mentioned in the provided context. Do NOT invent facts or extrapolate beyond the provided text.
5. Insufficient Context: If the retrieved text does NOT contain enough information to answer the user's specific question, reply EXACTLY with:
"I couldn't find enough information about this question in the medication sources currently available in MediRAG."
6. No Diagnostics or Personal Prescriptions: Do not diagnose conditions or give personalized medical treatment prescriptions. Include a polite reminder at the end to consult a doctor or pharmacist for clinical advice.

Answer the question now following these formatting rules:"""

def generate_grounded_answer(question: str, drug_name: Optional[str] = None) -> Dict[str, Any]:
    """
    Executes the RAG pipeline with detailed diagnostic logging.
    """
    logger.info("==================== RAG RETRIEVAL DIAGNOSTICS ====================")
    logger.info(f"User Query: '{question}'")
    logger.info(f"Requested Drug Filter: '{drug_name}'")
    
    # Search ChromaDB
    retrieved_items = search_similar_chunks(question, drug_name=drug_name, k=8)
    
    logger.info(f"Number of Chunks Retrieved: {len(retrieved_items)}")
    
    if not retrieved_items:
        logger.warning("No chunks retrieved from ChromaDB.")
        return {
            "answer": "I couldn't find enough information about this question in the medication sources currently available in MediRAG.\n\nTry asking about side effects, warnings, interactions, contraindications, or storage information.",
            "sources": []
        }

    # Extract Document objects and log retrieval details
    chunks = []
    for idx, item in enumerate(retrieved_items):
        doc = item["doc"]
        score = item.get("score", 0.0)
        chunks.append(doc)
        med = doc.metadata.get("drug_name") or doc.metadata.get("generic_name") or "Unknown"
        section = doc.metadata.get("section_name") or "General"
        src = doc.metadata.get("source") or "FDA Document"
        logger.info(f"Chunk [{idx+1}] | Score: {score:.4f} | Med: {med} | Section: {section} | Source: {src}")

    # Combine context text
    context_text = "\n\n".join([chunk.page_content for chunk in chunks])
    logger.info(f"Context Length Sent to LLM: {len(context_text)} characters")

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
        logger.info("LLM Generation Successful.")
    except Exception as e:
        logger.error(f"RAG LLM execution failed: {e}. Falling back to offline context extraction.")
        
        # Build offline fallback text using retrieved chunks
        bullet_points = []
        for chunk in chunks[:3]:
            cleaned_chunk_text = chunk.page_content.split("Content: ")[-1].strip()
            if len(cleaned_chunk_text) > 300:
                cleaned_chunk_text = cleaned_chunk_text[:300] + "..."
            bullet_points.append(cleaned_chunk_text)
            
        bullets = "\n\n• ".join(bullet_points)
        answer = (
            f"### Medication Information (Offline Mode)\n\n"
            f"• {bullets}\n\n"
            f"*Note: The AI generator is currently offline. The information above was retrieved directly from local FDA data. Always consult a healthcare professional for advice.*"
        )

    # Clean fallback output if LLM generated the generic rejection phrase
    if "I couldn't find enough information about this question" in answer and len(answer) < 150:
        answer = (
            "I couldn't find enough information about this question in the medication sources currently available in MediRAG.\n\n"
            "Try asking about side effects, warnings, interactions, contraindications, or storage information."
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
            section_display = section.replace("_", " ").title()
            
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

