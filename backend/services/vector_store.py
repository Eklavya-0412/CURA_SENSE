"""
Vector Store Service with abstract interface for easy cloud DB upgrade.
Currently implements ChromaDB, but designed to be swappable.
"""
from abc import ABC, abstractmethod
from typing import List, Optional
import chromadb
from chromadb.config import Settings
from langchain_chroma import Chroma
from langchain_core.documents import Document

from config import CHROMA_PERSIST_DIR, VECTOR_DB_TYPE
from services.embeddings import EmbeddingService


class VectorStoreService(ABC):
    """Abstract base class for vector store implementations."""
    
    @abstractmethod
    def add_documents(self, documents: List[Document], collection_name: str = "default") -> List[str]:
        """Add documents to the vector store."""
        pass
    
    @abstractmethod
    def similarity_search(self, query: str, k: int = 4, collection_name: str = "default") -> List[Document]:
        """Search for similar documents."""
        pass
    
    @abstractmethod
    def delete_collection(self, collection_name: str) -> bool:
        """Delete a collection."""
        pass
    
    @abstractmethod
    def list_collections(self) -> List[str]:
        """List all collections."""
        pass


class ChromaDBService(VectorStoreService):
    """ChromaDB implementation of VectorStoreService."""
    
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        if not hasattr(self, '_initialized'):
            self._embedding_service = EmbeddingService()
            self._client = chromadb.PersistentClient(
                path=CHROMA_PERSIST_DIR,
                settings=Settings(anonymized_telemetry=False)
            )
            self._vector_stores = {}
            self._initialized = True
    
    def _get_vectorstore(self, collection_name: str) -> Chroma:
        """Get or create a Chroma vectorstore for the given collection."""
        if collection_name not in self._vector_stores:
            self._vector_stores[collection_name] = Chroma(
                client=self._client,
                collection_name=collection_name,
                embedding_function=self._embedding_service.embeddings,
                persist_directory=CHROMA_PERSIST_DIR
            )
        return self._vector_stores[collection_name]
    
    def add_documents(self, documents: List[Document], collection_name: str = "default") -> List[str]:
        """Add documents to ChromaDB collection."""
        vectorstore = self._get_vectorstore(collection_name)
        ids = vectorstore.add_documents(documents)
        return ids
    
    def similarity_search(self, query: str, k: int = 4, collection_name: str = "default") -> List[Document]:
        """Search for similar documents in ChromaDB."""
        vectorstore = self._get_vectorstore(collection_name)
        return vectorstore.similarity_search(query, k=k)
    
    def similarity_search_with_score(self, query: str, k: int = 4, collection_name: str = "default") -> List[tuple]:
        """Search with relevance scores."""
        vectorstore = self._get_vectorstore(collection_name)
        return vectorstore.similarity_search_with_score(query, k=k)
    
    def delete_collection(self, collection_name: str) -> bool:
        """Delete a collection from ChromaDB."""
        try:
            self._client.delete_collection(collection_name)
            if collection_name in self._vector_stores:
                del self._vector_stores[collection_name]
            return True
        except Exception:
            return False
    
    def list_collections(self) -> List[str]:
        """List all collections in ChromaDB."""
        collections = self._client.list_collections()
        return [col.name for col in collections]
    
    def get_retriever(self, collection_name: str = "default", k: int = 4):
        """Get a LangChain retriever for the collection."""
        vectorstore = self._get_vectorstore(collection_name)
        return vectorstore.as_retriever(search_kwargs={"k": k})


def get_vector_store() -> VectorStoreService:
    """Factory function to get the appropriate vector store based on config."""
    if VECTOR_DB_TYPE == "chroma":
        return ChromaDBService()
    # Future: Add other implementations
    # elif VECTOR_DB_TYPE == "pinecone":
    #     return PineconeService()
    # elif VECTOR_DB_TYPE == "qdrant":
    #     return QdrantService()
    else:
        raise ValueError(f"Unsupported vector DB type: {VECTOR_DB_TYPE}")
