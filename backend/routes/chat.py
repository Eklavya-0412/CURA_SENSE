"""
Chat routes for the AI assistant.
"""
from fastapi import APIRouter, HTTPException

from models.schemas import ChatRequest, ChatResponse
from services.chain import ChainService

router = APIRouter(prefix="/chat", tags=["Chat"])


@router.post("/", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """
    Send a message to the AI assistant.
    
    - Uses RAG to retrieve relevant context from the vector store
    - Maintains conversation history for context
    """
    chain_service = ChainService()
    result = await chain_service.query(
        question=request.message,
        collection_name=request.collection_name,
        use_rag=request.use_rag
    )
    
    if not result["success"]:
        raise HTTPException(status_code=500, detail=result.get("error", "Unknown error"))
    
    return ChatResponse(
        success=True,
        response=result["response"],
        sources=[{"content": s["content"], "metadata": s["metadata"]} for s in result.get("sources", [])]
    )


@router.post("/clear-history")
async def clear_history():
    """Clear the conversation history."""
    chain_service = ChainService()
    chain_service.clear_chat_history()
    return {"success": True, "message": "Chat history cleared"}
