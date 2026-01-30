"""
Document routes for ingesting and managing documents.
"""
import os
import tempfile
import aiofiles
from fastapi import APIRouter, HTTPException, UploadFile, File, Form

from models.schemas import (
    TextIngestionRequest,
    IngestionResponse,
    CollectionListResponse,
    DeleteCollectionResponse
)
from services.chain import ChainService

router = APIRouter(prefix="/documents", tags=["Documents"])


@router.post("/upload-pdf", response_model=IngestionResponse)
async def upload_pdf(
    file: UploadFile = File(...),
    collection_name: str = Form(default="default")
):
    """
    Upload and ingest a PDF file into the vector store.
    """
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="File must be a PDF")
    
    # Save uploaded file temporarily
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as temp_file:
        content = await file.read()
        temp_file.write(content)
        temp_path = temp_file.name
    
    try:
        chain_service = ChainService()
        result = await chain_service.ingest_pdf(temp_path, collection_name)
        
        if not result["success"]:
            raise HTTPException(status_code=500, detail=result.get("error", "Failed to ingest PDF"))
        
        return IngestionResponse(**result)
    finally:
        # Clean up temp file
        os.unlink(temp_path)


@router.post("/ingest-text", response_model=IngestionResponse)
async def ingest_text(request: TextIngestionRequest):
    """
    Ingest raw text into the vector store.
    """
    chain_service = ChainService()
    result = await chain_service.ingest_text(
        text=request.text,
        metadata=request.metadata,
        collection_name=request.collection_name
    )
    
    if not result["success"]:
        raise HTTPException(status_code=500, detail=result.get("error", "Failed to ingest text"))
    
    return IngestionResponse(**result)


@router.get("/collections", response_model=CollectionListResponse)
async def list_collections():
    """
    List all available document collections.
    """
    chain_service = ChainService()
    collections = chain_service.get_collections()
    return CollectionListResponse(collections=collections)


@router.delete("/collections/{collection_name}", response_model=DeleteCollectionResponse)
async def delete_collection(collection_name: str):
    """
    Delete a document collection.
    """
    chain_service = ChainService()
    success = chain_service.delete_collection(collection_name)
    
    if success:
        return DeleteCollectionResponse(success=True, message=f"Collection '{collection_name}' deleted")
    else:
        raise HTTPException(status_code=404, detail=f"Collection '{collection_name}' not found")
