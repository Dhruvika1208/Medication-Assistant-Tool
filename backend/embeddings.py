from langchain_community.embeddings import HuggingFaceEmbeddings

def get_embedding_model() -> HuggingFaceEmbeddings:
    """
    Returns HuggingFaceEmbeddings instance loaded with the 'all-MiniLM-L6-v2' model.
    """
    # model_name = "sentence-transformers/all-MiniLM-L6-v2"
    # This runs locally and embeds text on the system.
    return HuggingFaceEmbeddings(
        model_name="sentence-transformers/all-MiniLM-L6-v2",
        model_kwargs={'device': 'cpu'},  # Default to CPU for reliability/compatibility
        encode_kwargs={'normalize_embeddings': True}
    )
