import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
    GROQ_API_KEY = os.getenv("GROQ_API_KEY")
    GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")
    DATABASE_URL = "sqlite:///./medication_assistant.db"
    CHROMA_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "chroma_db"))
    
    # JWT Security Configuration
    JWT_SECRET = os.getenv("JWT_SECRET", "super-secret-key-for-medirag-jwt-tokens-2026")
    JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))  # 24 hours

settings = Settings()
