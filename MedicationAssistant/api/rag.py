import chromadb
from sentence_transformers import SentenceTransformer

model = SentenceTransformer("all-MiniLM-L6-v2")

def create_temp_vector_store(text: str):
    client = chromadb.Client()
    collection = client.create_collection("temp")

    chunks = text.split("\n\n")
    embeddings = model.encode(chunks).tolist()

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
