"""
Embedding Service for generating text embeddings.
Uses HuggingFace Sentence Transformers for local embeddings.
"""
from langchain_huggingface import HuggingFaceEmbeddings
from config import EMBEDDING_MODEL


class EmbeddingService:
    """Service for generating text embeddings using HuggingFace models."""
    
    _instance = None
    _embeddings = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        if self._embeddings is None:
            self._embeddings = HuggingFaceEmbeddings(
                model_name=EMBEDDING_MODEL,
                model_kwargs={'device': 'cpu'},
                encode_kwargs={'normalize_embeddings': True}
            )
    
    @property
    def embeddings(self):
        """Get the embeddings model."""
        return self._embeddings
    
    def embed_text(self, text: str) -> list[float]:
        """Embed a single text string."""
        return self._embeddings.embed_query(text)
    
    def embed_documents(self, documents: list[str]) -> list[list[float]]:
        """Embed multiple documents."""
        return self._embeddings.embed_documents(documents)
