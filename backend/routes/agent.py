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


class ClientSubmission(BaseModel):
    """Client/Merchant submission of a support issue"""
    message: str
    merchant_id: str = "unknown"


# ============ Router ============

router = APIRouter(prefix="/agent", tags=["Support Agent"])


@router.post("/submit")
async def client_submit_problem(request: ClientSubmission):
    """
    Client Side HTTP: Merchant sends their issue.
    
    This endpoint is used by merchants (clients) to submit support problems.
    The AI will analyze the issue and queue it for human approval before
    sending a response back to the merchant.
    
    Returns a session_id that can be used to poll for the resolution.
    """
    session_id = await support_agent.analyze_async(request.message, request.merchant_id)
    return {"session_id": session_id, "status": "processing"}


@router.get("/client/poll/{session_id}")
async def client_poll_resolution(session_id: str):
    """
    Client Side HTTP: Merchant polls to see if support approved a response.
    
    This endpoint is called by the merchant UI to check if their issue
    has been resolved and dispatched by the support team.
    
    Returns:
    - status: "pending" while waiting for support review
    - status: "resolved" with the response when approved
    """
    session = support_agent.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Get the raw session data for status check
    raw_session = support_agent._sessions.get(session_id)
    if not raw_session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    status = raw_session.get("status")
    
    # Handle HealingStatus enum comparison
    if hasattr(status, 'value'):
        status_value = status.value
    else:
        status_value = str(status)
    
    # Hide internal reasoning/risk from the client until DISPATCHED
    if status_value != "dispatched":
        return {
            "status": "pending", 
            "message": "Support is reviewing your request...",
            "session_status": status_value
        }
    
    # Get proposed action response
    proposed_action = raw_session.get("proposed_action")
    if proposed_action:
        if hasattr(proposed_action, 'draft_content'):
            response_content = proposed_action.draft_content
        else:
            response_content = proposed_action.get("draft_content", "")
    else:
        response_content = "Your issue has been resolved."
    
    return {
        "status": "resolved",
        "response": response_content,
        "dispatched_at": raw_session.get("dispatched_at", "").isoformat() if raw_session.get("dispatched_at") else None
    }


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


# ============ Merchant Portal Endpoints ============

class MerchantIssue(BaseModel):
    """Merchant issue submission"""
    message: str
    merchant_id: str


@router.post("/merchant/submit")
async def merchant_submit(request: MerchantIssue):
    """
    Merchant submits their problem. Returns a session_id for polling.
    
    This is the entry point for the Merchant Portal (Port 3000).
    The merchant describes their issue and receives a session ID to track progress.
    """
    session_id = await support_agent.analyze_async(
        client_message=request.message,
        merchant_id=request.merchant_id
    )
    return {"session_id": session_id, "status": "processing"}


@router.get("/merchant/poll/{session_id}")
async def merchant_poll(session_id: str):
    """
    Merchant polls for the APPROVED solution.
    
    This endpoint only returns the solution when status is DISPATCHED.
    Otherwise, it returns a pending status to keep the merchant waiting.
    """
    session = support_agent.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Get the raw session data for status check
    raw_session = support_agent._sessions.get(session_id)
    if not raw_session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    status = raw_session.get("status")
    
    # Handle HealingStatus enum comparison
    if hasattr(status, 'value'):
        status_value = status.value
    else:
        status_value = str(status)
    
    # Crucial: Only return the solution if status is DISPATCHED
    if status_value == "dispatched":
        # Pull the final drafted text from the session state
        proposed_action = raw_session.get("proposed_action")
        if proposed_action:
            if hasattr(proposed_action, 'draft_content'):
                solution = proposed_action.draft_content
            else:
                solution = proposed_action.get("draft_content", "No solution drafted.")
        else:
            solution = "Your issue has been resolved."
        
        return {
            "status": "resolved",
            "solution": solution
        }
    
    return {
        "status": "pending",
        "message": "Support team is reviewing your request...",
        "session_status": status_value
    }


@router.get("/merchant/view/{session_id}")
async def merchant_view(session_id: str):
    """
    Returns ONLY the final response to the merchant.
    Filters out all 'thinking', 'diagnoses', and 'reasoning'.
    
    This is the boundary control endpoint - merchants never see:
    - AI reasoning
    - Risk assessments
    - Confidence scores
    - Internal explanations
    
    They only see the approved solution when status is DISPATCHED.
    """
    session = support_agent.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    # Get the raw session data
    full_state = support_agent._sessions.get(session_id)
    if not full_state:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    status = full_state.get("status")
    
    # Handle HealingStatus enum comparison
    if hasattr(status, 'value'):
        status_value = status.value
    else:
        status_value = str(status)
    
    # Check if the support team has dispatched the fix
    if status_value == "dispatched":
        action = full_state.get("proposed_action")
        
        if action:
            if hasattr(action, 'draft_content'):
                solution = action.draft_content
            else:
                solution = action.get("draft_content", "Check documentation for fix.")
        else:
            solution = "Your issue has been resolved. Please check our documentation for details."
        
        return {
            "status": "resolved",
            "message": "A resolution has been approved by our engineering team.",
            "solution": solution
        }
    
    return {
        "status": "processing",
        "message": "Our automated agent is currently investigating the root cause. Support will review shortly."
    }
