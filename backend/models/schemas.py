"""
Pydantic models for API request/response schemas.
"""
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


# Chat Schemas
class ChatRequest(BaseModel):
    """Request schema for chat endpoint."""
    message: str = Field(..., description="User message to send to the AI")
    collection_name: str = Field(default="default", description="Collection to search for context")
    use_rag: bool = Field(default=True, description="Whether to use RAG for context retrieval")


class SourceDocument(BaseModel):
    """Schema for source document in response."""
    content: str
    metadata: Dict[str, Any] = {}


class ChatResponse(BaseModel):
    """Response schema for chat endpoint."""
    success: bool
    response: Optional[str] = None
    sources: List[SourceDocument] = []
    error: Optional[str] = None


# Document Schemas
class TextIngestionRequest(BaseModel):
    """Request schema for text ingestion."""
    text: str = Field(..., description="Text content to ingest")
    metadata: Optional[Dict[str, Any]] = Field(default=None, description="Optional metadata")
    collection_name: str = Field(default="default", description="Collection to store in")


class IngestionResponse(BaseModel):
    """Response schema for document ingestion."""
    success: bool
    message: Optional[str] = None
    chunk_count: Optional[int] = None
    ids: Optional[List[str]] = None
    error: Optional[str] = None


# Collection Schemas
class CollectionListResponse(BaseModel):
    """Response schema for listing collections."""
    collections: List[str]


class DeleteCollectionResponse(BaseModel):
    """Response schema for deleting a collection."""
    success: bool
    message: str


# Health Check
class HealthResponse(BaseModel):
    """Response schema for health check."""
    status: str
    message: str
