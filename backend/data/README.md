# MediRAG RAG Knowledge-Base Folder Guide

This directory manages the raw and processed data sources used by the MediRAG vector database (`ChromaDB`).

## Directory Structure

```text
backend/data/
├── raw/
│   ├── drug_labels/  <-- Place FDA/openFDA drug label JSON files here
│   └── documents/    <-- Place custom medication reference documents here (PDF, TXT, JSON)
└── processed/        <-- Directory for temporary or processed outputs
```

## Knowledge Sources & Formats

### 1. Official FDA Drug Labels
- **Path**: `backend/data/raw/drug_labels/`
- **Format**: `.json` (either structured openFDA drug label JSON from the API, or custom FDA label files).
- **Processing**: The ingestion system extracts fields like `indications_and_usage`, `dosage_and_administration`, `contraindications`, `warnings_and_precautions`, `adverse_reactions`, etc.
- **Source Badge**: Displayed in the chat UI as **FDA Official**.

### 2. Local trusted documents
- **Path**: `backend/data/raw/documents/`
- **Format**: `.pdf`, `.txt`, `.json`
- **Processing**: Extracted text is clean of formatting artifacts and chunked.
- **Source Badge**: Displayed in the chat UI as **Local Document**.

---

## Commands & Workflow

### 1. Ingestion of New Files
Whenever you add or update files in `drug_labels/` or `documents/`, run the ingestion script from the workspace root:

```bash
python -m ingestion.ingest
```

This script will:
1. Scan the folders for supported files.
2. Load and parse the contents.
3. Clean and chunk the text.
4. Delete old chunks corresponding to those files from ChromaDB (to prevent duplicate entries).
5. Generate embeddings using Sentence Transformers (`all-MiniLM-L6-v2`).
6. Store them in the persistent ChromaDB collection.

### 2. Fetching Official openFDA Labels
To download new FDA drug-label JSON files directly from the openFDA API, run:

```bash
python -m ingestion.fetch_fda --drug "<medication_name>"
```

Example:
```bash
python -m ingestion.fetch_fda --drug Ibuprofen
```
The raw JSON response will be saved directly into `backend/data/raw/drug_labels/ibuprofen.json`. After fetching, run the ingestion script to process the new data.

### 3. Rebuilding the Database from Scratch
To wipe and rebuild the entire vector store:
1. Stop the FastAPI server.
2. Delete the `backend/chroma_db/` folder.
3. Run the ingestion command:
   ```bash
   python -m ingestion.ingest
   ```
4. Start the FastAPI server again.
