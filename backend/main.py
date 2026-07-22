import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.database import engine, Base
from backend.routes import router

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("backend")

# Initialize database tables
logger.info("Initializing SQLite database tables...")
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="MediRAG – AI-Powered Medication Information Assistant",
    description="A full-stack RAG assistant grounded in official FDA drug label data.",
    version="1.0.0"
)

# Enable CORS for the Vite React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins in development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routes with the /api prefix
app.include_router(router, prefix="/api")

@app.get("/")
def read_root():
    return {
        "message": "Welcome to the MediRAG Backend API!",
        "documentation": "/docs",
        "health": "/api/health"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="127.0.0.1", port=8000, reload=True)
