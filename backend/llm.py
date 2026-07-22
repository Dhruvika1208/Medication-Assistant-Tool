from backend.config import settings
import os

def get_llm():
    """
    Returns ChatGroq or ChatOpenAI instance initialized with the configured API key.
    Checks GROQ_API_KEY first, then falls back to OPENAI_API_KEY.
    """
    groq_key = settings.GROQ_API_KEY
    openai_key = settings.OPENAI_API_KEY
    
    if groq_key:
        from langchain_groq import ChatGroq
        return ChatGroq(
            api_key=groq_key,
            model=settings.GROQ_MODEL,
            temperature=0.0,
            max_retries=2
        )
    elif openai_key:
        try:
            from langchain_openai import ChatOpenAI
        except ImportError:
            from langchain_community.chat_models import ChatOpenAI
            
        return ChatOpenAI(
            openai_api_key=openai_key,
            model_name="gpt-3.5-turbo",
            temperature=0.0,
            max_retries=2
        )
    else:
        raise ValueError("Neither GROQ_API_KEY nor OPENAI_API_KEY is set in .env file.")

