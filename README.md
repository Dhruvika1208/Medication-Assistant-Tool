# MediRAG – AI-Powered Medication Information Assistant Using RAG

MediRAG is a clinical-grade, full-stack Medication Information Assistant that leverages **Retrieval-Augmented Generation (RAG)** to provide source-grounded answers to queries about drug label information (such as dosage, warnings, side effects, contraindications, and storage). The application retrieves official, structured FDA drug-label data, stores vector embeddings locally in ChromaDB, and uses LangChain + Groq (Llama-3 model) to generate verified responses, ensuring patients and clinicians receive trustworthy answers with clickable source verification, avoiding AI hallucinations.

---

## Architecture Overview

```

                      +-----------------------------+
                      |     React Vite Frontend     |
                      +--------------+--------------+
                                     |
                                     | REST APIs
                                     v
                      +--------------+--------------+
                      |       FastAPI Backend       |
                      +-------+--------------+------+
                              |              |
           1. Retrieval Phase |              | 2. Generation Phase (Groq/Llama-3)
                              v              v
                      +-------+------+  +----+------------------+
                      |   ChromaDB   |  | LangChain RAG Chain   |
                      |  Vector Store|  | (Strict System Prompt)|
                      +--------------+  +----+------------------+
                              ^              |
             Ingestion Phase  |              v
                      +-------+------+  +----+------------------+
                      | openFDA API  |  | Grounded Response     |
                      | Drug Labels  |  | + Structured Sources  |
                      +--------------+  +-----------------------+
```

---

## Core RAG Workflow

1. **Ingestion**: Fetches FDA drug-label data for common medications (e.g. Ibuprofen, Metformin, Amoxicillin, Lisinopril, Simvastatin, Omeprazole, Atorvastatin, Albuterol, Gabapentin, Acetaminophen) from the official openFDA API.
2. **Preprocessing**: Cleans raw text, extracts structured sections, and splits sections into chunks using LangChain's `RecursiveCharacterTextSplitter`.
3. **Embedding**: Generates vector representations of the chunks using Hugging Face's `all-MiniLM-L6-v2` Sentence Transformer.
4. **Storage**: Saves the embeddings and rich metadata (`drug_name`, `generic_name`, `section_name`, `source`, `doc_id`) in a persistent ChromaDB database (`./chroma_db`).
5. **Retrieval**: When a query is made, ChromaDB executes a similarity search (restricted to the queried drug context, if selected) using the question's embedding.
6. **Generation**: The retrieved label chunks and query are sent with strict system prompts to the Groq LLM (Llama-3-8B-Instant) to generate a clinically guarded response.
7. **Offline Fallback**: In the event of API rate limits or network issues, the backend extracts the most relevant raw FDA text directly from the local vector database, guaranteeing accessibility.
8. **Sources Output**: Returns the generated response along with structured metadata (medication name, label section, source text excerpt, and identifiers).

---

## Folder Structure

```
drug-medicine reminder/
├── backend/                       # Python FastAPI Backend
│   ├── config.py                  # API Keys, model names & path configs
│   ├── database.py                # SQLAlchemy DB setup for reminders
│   ├── models.py                  # Database schemas (Reminder, OccurrenceLog)
│   ├── reminder.py                # CRUD queries & schedule generation
│   ├── data_loader.py             # openFDA API fetch utility
│   ├── document_processor.py      # Text cleaner & LangChain recursive splitter
│   ├── embeddings.py              # Sentence Transformer (all-MiniLM-L6-v2) definition
│   ├── vector_store.py            # Persistent ChromaDB collection operations
│   ├── llm.py                     # LangChain ChatGroq initialization
│   ├── rag_chain.py               # LangChain RAG sequence, prompt, and fallback
│   ├── routes.py                  # FastAPI route controllers
│   ├── main.py                    # FastAPI entrypoint, middleware, CORS
│   ├── ingest.py                  # Standalone CLI ingestion pipeline script
│   └── requirements.txt           # Python dependency file
│
├── frontend/                      # React.js Vite Frontend
│   ├── public/                    # Static assets
│   ├── src/
│   │   ├── App.jsx                # Redesigned RAG chat layout & reminder components
│   │   ├── App.css                # Premium custom stylesheet with full responsive CSS variables
│   │   └── main.jsx               # React initialization
│   ├── index.html                 # App container, Google Fonts & icons
│   └── package.json               # Node packages
│
├── accuracy/                      # RAG Evaluation Suite
│   ├── test_cases.json            # Target test questions, drugs, and keywords
│   └── evaluate_accuracy.py       # RAG evaluator using actual backend modules
│
├── .env.example                   # Environment configuration template
├── .gitignore                     # Git ignore file (ignores database files, .env, directories)
└── README.md                      # System documentation
```

---

## Prerequisites

- **Python 3.10+** (tested on 3.12.3)
- **Node.js 18+**
- **Groq API Key** (for RAG inference)

---

## Installation & Setup

### 1. Environment Configuration

Create a `.env` file in the project root directory and add your credentials:
```env
GROQ_API_KEY=gsk_your_groq_api_key_here
GROQ_MODEL=llama-3.1-8b-instant
```

### 2. Backend Setup

1. Open your terminal in the project root.
2. Install Python requirements:
   ```bash
   pip install -r backend/requirements.txt
   ```
3. Ingest data to populate the persistent ChromaDB vector database:
   
   First, download official openFDA JSON labels (this runs once to retrieve data, saving it locally to prevent querying the API during user questions):
   ```bash
   python -m ingestion.fetch_fda --all
   ```
   
   Next, run the ingestion pipeline to process all labels and any local documents placed in the data folders:
   ```bash
   python -m ingestion.ingest
   ```
4. Start the FastAPI development server:
   ```bash
   python -m uvicorn backend.main:app --port 8000 --reload
   ```
   The backend API will run on `http://127.0.0.1:8000`. API docs can be viewed at `http://127.0.0.1:8000/docs`.

### 3. Frontend Setup

1. Open a new terminal and navigate to the `frontend` folder:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the React app:
   ```bash
   npm run dev
   ```
   The development server will run on `http://localhost:5173`. Open this URL in your web browser.

---

## Running Accuracy Evaluation

To test semantic chunk retrieval and response validation:
```bash
python accuracy/evaluate_accuracy.py
```

---

## Key API Endpoints

- `GET /api/health`: Verify that the server is up.
- `POST /api/chat`: Process query using RAG.
  - **Request Body**: `{ "question": "What is the recommended dosage?", "drug": "Ibuprofen" }`
  - **Response**: `{ "answer": "...", "sources": [...] }`
- `GET /api/drugs/search`: Return all indexed brand and generic medications in ChromaDB.
- `GET /api/reminders`: Fetch active medication reminders.
- `POST /api/reminders`: Configure a new reminder schedule.

---

## Limitations

1. **Local Embeddings Load**: Downloading the `all-MiniLM-L6-v2` Sentence Transformer model requires an internet connection on the first execution. Subsequent executions run entirely offline.
2. **Browser Push Limits**: Desktop notifications require the React application tab to remain open in the browser. If the tab or browser is closed, JavaScript timers stop, and alerts will not fire.

---
