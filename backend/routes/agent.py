"""
Agent API Routes for MigraGuard Support Agent.
Provides endpoints for issue analysis, approval queue, and session history.
"""

from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from services.support_agent import support_agent
from models.types import AgentOutput


# ============ Request/Response Models ============

class TicketInput(BaseModel):
    """Input model for a support ticket"""
    id: Optional[str] = None
    merchant_id: str
    subject: str
    description: str
    migration_stage: str = "unknown"
    priority: str = "medium"
    timestamp: Optional[str] = None


class ErrorInput(BaseModel):
    """Input model for an error log"""
    id: Optional[str] = None
    merchant_id: Optional[str] = None
    error_code: str
    error_message: str
    stack_trace: Optional[str] = None
    endpoint: Optional[str] = None
    migration_stage: str = "unknown"
    timestamp: Optional[str] = None


class AnalyzeRequest(BaseModel):
    """Request to analyze tickets/errors"""
    tickets: List[TicketInput] = []
    errors: List[ErrorInput] = []


class ApprovalDecision(BaseModel):
    """Human approval decision"""
    approval_id: str
    approved: bool
    reviewer_notes: Optional[str] = None
    actual_resolution: Optional[str] = None


# ============ Router ============

router = APIRouter(prefix="/agent", tags=["Support Agent"])


@router.post("/analyze", response_model=AgentOutput)
async def analyze_issues(request: AnalyzeRequest):
    """
    Analyze support tickets and/or error logs through the 10-step workflow.
    
    The agent will:
    1. Observe and normalize inputs
    2. Cluster similar issues
    3. Search the knowledge base (RAG)
    4. Diagnose root cause with confidence score
    5. Assess risk level
    6. Decide on appropriate action
    7. Draft a response (no auto-send)
    8. Explain reasoning
    9. Queue for approval if high-risk or low-confidence
    10. Store learnings for future reference
    
    Returns structured output matching the system prompt format.
    """
    if not request.tickets and not request.errors:
        raise HTTPException(
            status_code=400,
            detail="At least one ticket or error is required"
        )
    
    result = await support_agent.analyze(
        tickets=[t.model_dump() for t in request.tickets],
        errors=[e.model_dump() for e in request.errors]
    )
    
    return result


@router.get("/queue")
async def get_approval_queue():
    """
    Get all pending actions awaiting human approval.
    
    Actions require approval when:
    - Risk level is HIGH
    - Confidence is below 85%
    - Action type is engineering escalation
    
    Returns list of pending approvals with context for decision-making.
    """
    return {
        "pending_count": len(support_agent.get_approval_queue()),
        "items": support_agent.get_approval_queue()
    }


@router.post("/approve")
async def approve_action(decision: ApprovalDecision):
    """
    Approve or reject a pending action.
    
    When approved:
    - The drafted action is marked ready for execution
    - If it's a learning candidate, the resolution is stored
    
    When rejected:
    - The session is closed without action
    - Reviewer notes can guide future improvements
    """
    result = await support_agent.approve_action(
        approval_id=decision.approval_id,
        approved=decision.approved,
        reviewer_notes=decision.reviewer_notes,
        actual_resolution=decision.actual_resolution
    )
    
    if not result.get("success"):
        raise HTTPException(
            status_code=404,
            detail=result.get("error", "Unknown error")
        )
    
    return result


@router.get("/session/{session_id}")
async def get_session(session_id: str):
    """
    Get details of a specific analysis session.
    
    Includes:
    - Current status
    - Diagnosis and risk assessment
    - Whether approval is required
    - Full explanation
    """
    session = support_agent.get_session(session_id)
    
    if not session:
        raise HTTPException(
            status_code=404,
            detail=f"Session {session_id} not found"
        )
    
    return session


@router.get("/history")
async def get_session_history(limit: int = 10):
    """
    Get recent analysis sessions.
    
    Includes both auto-resolved and human-escalated sessions.
    Useful for reviewing past decisions and learning from outcomes.
    """
    return {
        "sessions": support_agent.get_recent_sessions(limit),
        "metrics": support_agent.get_metrics()
    }


@router.get("/metrics")
async def get_metrics():
    """
    Get agent performance metrics.
    
    Includes:
    - Total sessions processed
    - Auto-resolved vs human-escalated counts
    - Number of learning events
    - Success rate
    - Pending approvals count
    """
    return support_agent.get_metrics()
