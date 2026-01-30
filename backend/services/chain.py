"""
LangChain Chain Service for RAG pipeline.
Handles document ingestion, retrieval, and LLM querying.
"""
from typing import List, Optional
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.messages import HumanMessage, AIMessage
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import PyPDFLoader, TextLoader
from langchain_core.documents import Document

from config import GOOGLE_API_KEY, LLM_MODEL
from services.vector_store import get_vector_store


class ChainService:
    """Service for managing LangChain chains and RAG pipeline."""
    
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        if not hasattr(self, '_initialized'):
            self._llm = ChatGoogleGenerativeAI(
                model=LLM_MODEL,
                google_api_key=GOOGLE_API_KEY,
                temperature=0.7,
                convert_system_message_to_human=True
            )
            self._vector_store = get_vector_store()
            self._text_splitter = RecursiveCharacterTextSplitter(
                chunk_size=1000,
                chunk_overlap=200
            )
            self._chat_history = []
            self._initialized = True
    
    def _format_docs(self, docs: List[Document]) -> str:
        """Format documents for context."""
        return "\n\n".join(doc.page_content for doc in docs)
    
    async def ingest_pdf(self, file_path: str, collection_name: str = "default") -> dict:
        """Ingest a PDF file into the vector store."""
        try:
            loader = PyPDFLoader(file_path)
            documents = loader.load()
            chunks = self._text_splitter.split_documents(documents)
            ids = self._vector_store.add_documents(chunks, collection_name)
            return {
                "success": True,
                "message": f"Ingested {len(chunks)} chunks from PDF",
                "chunk_count": len(chunks),
                "ids": ids
            }
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    async def ingest_text(self, text: str, metadata: dict = None, collection_name: str = "default") -> dict:
        """Ingest raw text into the vector store."""
        try:
            doc = Document(page_content=text, metadata=metadata or {})
            chunks = self._text_splitter.split_documents([doc])
            ids = self._vector_store.add_documents(chunks, collection_name)
            return {
                "success": True,
                "message": f"Ingested {len(chunks)} chunks",
                "chunk_count": len(chunks),
                "ids": ids
            }
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    async def query(self, question: str, collection_name: str = "default", use_rag: bool = True) -> dict:
        """Query the LLM with optional RAG context."""
        try:
            context = ""
            sources = []
            
            if use_rag:
                # Retrieve relevant documents
                docs = self._vector_store.similarity_search(question, k=4, collection_name=collection_name)
                context = self._format_docs(docs)
                sources = [{"content": doc.page_content[:200], "metadata": doc.metadata} for doc in docs]
            
            # Build the prompt
            if use_rag and context:
                system_prompt = """You are a helpful AI assistant. Use the following context to answer the user's question. 
If the context doesn't contain relevant information, say so and provide a general answer.

Context:
{context}
"""
                prompt = ChatPromptTemplate.from_messages([
                    ("system", system_prompt),
                    MessagesPlaceholder(variable_name="chat_history"),
                    ("human", "{question}")
                ])
            else:
                prompt = ChatPromptTemplate.from_messages([
                    ("system", "You are a helpful AI assistant."),
                    MessagesPlaceholder(variable_name="chat_history"),
                    ("human", "{question}")
                ])
            
            # Create the chain
            chain = prompt | self._llm | StrOutputParser()
            
            # Run the chain
            response = await chain.ainvoke({
                "context": context,
                "question": question,
                "chat_history": self._chat_history
            })
            
            # Update chat history
            self._chat_history.append(HumanMessage(content=question))
            self._chat_history.append(AIMessage(content=response))
            
            # Keep only last 10 messages
            if len(self._chat_history) > 20:
                self._chat_history = self._chat_history[-20:]
            
            return {
                "success": True,
                "response": response,
                "sources": sources if use_rag else []
            }
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def clear_chat_history(self):
        """Clear the chat history."""
        self._chat_history = []
    
    def get_collections(self) -> List[str]:
        """Get all available collections."""
        return self._vector_store.list_collections()
    
    def delete_collection(self, collection_name: str) -> bool:
        """Delete a collection."""
        return self._vector_store.delete_collection(collection_name)
