from langchain_groq import ChatGroq
from backend.config import settings
import os

def get_llm() -> ChatGroq:
    """
    Returns ChatGroq instance initialized with the Groq API key and model.
    Throws a descriptive error if the key is missing.
    """
    api_key = settings.GROQ_API_KEY
    if not api_key:
        raise ValueError("GROQ_API_KEY is not set. Please set it in your .env file.")
        
    return ChatGroq(
        api_key=api_key,
        model=settings.GROQ_MODEL,
        temperature=0.0,  # 0.0 temperature for strict adherence to provided facts (clinical safety)
        max_retries=2
    )
