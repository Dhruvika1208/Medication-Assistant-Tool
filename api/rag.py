import chromadb
from sentence_transformers import SentenceTransformer

model = SentenceTransformer("all-MiniLM-L6-v2")

def create_temp_vector_store(text: str):
    client = chromadb.Client()

    # FIX: get_or_create_collection avoids "already exists" error
    collection = client.get_or_create_collection("temp")

    # Clear old documents (important for second search)
    try:
        all_ids = [d for d in collection.get()["ids"]]
        if all_ids:
            collection.delete(ids=all_ids)
    except:
        pass

    # Split text into chunks
    chunks = text.split("\n\n")
    embeddings = model.encode(chunks).tolist()

    # Add chunks into collection
    collection.add(
        documents=chunks,
        ids=[str(i) for i in range(len(chunks))],
        embeddings=embeddings
    )

    return collection


def retrieve_answer(collection, question: str):
    query_emb = model.encode([question]).tolist()
    results = collection.query(query_embeddings=query_emb, n_results=3)
    docs = results["documents"][0]
    return "\n\n".join(docs)
