"""
Agent API Routes for MigraGuard Support Agent.
Provides endpoints for issue analysis, approval queue, and session history.
"""

from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from services.support_agent import support_agent
from models.types import AgentOutput, HealingStatus


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
    """Calculate real-time system health metrics"""
    total = len(support_agent._sessions)
    if total == 0:
        return {
            "success_rate": 0,
            "total_sessions": 0,
            "learning_events_count": 0,
            "avg_resolution_time": 0,
            "active_sessions": 0
        }
        
    # Count specific states
    completed = 0
    dispatched = 0
    failed = 0
    learning_events = 0
    
    for s in support_agent._sessions.values():
        status = s.get("status")
        # Handle Enum or string
        if hasattr(status, 'value'):
            status_val = status.value
        else:
            status_val = str(status)
            
        if status_val == "completed": completed += 1
        if status_val == "dispatched": dispatched += 1
        if status_val == "failed": failed += 1
        if s.get("is_learning_candidate"): learning_events += 1

    # Success = (Completed + Dispatched) / Total Finished
    # We avoid dividing by zero if no sessions are finished
    finished_count = completed + dispatched + failed
    success_rate = ((completed + dispatched) / finished_count) if finished_count > 0 else 0

    return {
        "success_rate": round(success_rate, 2),
        "total_sessions": total,
        "learning_events_count": learning_events,
        "active_sessions": total - finished_count
    }


@router.get("/analytics")
async def get_analytics():
    """Aggregate data for the visual dashboard"""
    error_types = {}
    severity_counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    
    for s in support_agent._sessions.values():
        # Count Error Types
        # Use diagnosis root cause or fallback to "Unknown"
        cause = "Unknown"
        if s.get("diagnosis"):
            if hasattr(s["diagnosis"], "root_cause"):
                 # Handle Enum
                if hasattr(s["diagnosis"].root_cause, "value"):
                    cause = s["diagnosis"].root_cause.value.replace("_", " ").title()
                else:
                    cause = str(s["diagnosis"].root_cause).replace("_", " ").title()
            else:
                 cause = str(s.get("diagnosis", {})).replace("_", " ").title()
        elif s.get("auto_generated"):
            # Try to guess from ticket
            ticket = s.get("original_ticket", {})
            cause = ticket.get("metadata", {}).get("category", "Auto-Detected").title()
        
        error_types[cause] = error_types.get(cause, 0) + 1
        
        # Count Severity
        risk = s.get("risk_assessment")
        if risk:
             # Handle Enum
            if hasattr(risk, "risk_level"):
                if hasattr(risk.risk_level, "value"):
                    level = risk.risk_level.value
                else:
                    level = str(risk.risk_level)
            else:
                level = "low"
                
            if level in severity_counts:
                severity_counts[level] += 1
            else:
                severity_counts[level] = 1 # Fallback for unexpected values
            
    # Calculate stats
    total_tickets = len(support_agent._sessions)
    resolved_count = 0
    success_sum = 0
    confidence_sum = 0
    confidence_count = 0
    
    for s in support_agent._sessions.values():
        status = s.get("status")
        # Handle Enum or string
        if hasattr(status, 'value'):
            status_val = status.value
        else:
            status_val = str(status)
            
        if status_val in ["completed", "dispatched"]:
            resolved_count += 1
            success_sum += 1
        elif status_val == "failed":
            success_sum += 0 # explicit
            
        # Confidence
        if s.get("diagnosis"):
            diagnosis = s["diagnosis"]
            conf = 0
            if hasattr(diagnosis, "confidence"):
                conf = diagnosis.confidence
            elif isinstance(diagnosis, dict):
                conf = diagnosis.get("confidence", 0)
            
            confidence_sum += conf
            confidence_count += 1

    success_rate = (resolved_count / total_tickets) if total_tickets > 0 else 0
    avg_confidence = (confidence_sum / confidence_count) if confidence_count > 0 else 0

    # Format for frontend
    return {
        "issue_distribution": error_types,
        "risk_profile": severity_counts,
        "total_tickets": total_tickets,
        "resolved_count": resolved_count,
        "success_rate": success_rate,
        "avg_confidence": avg_confidence
    }


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
    
    # CRITICAL FIX: Explicitly save metadata so it appears in history
    # Manual tickets are NOT auto_generated, but they belong to the merchant
    if session_id in support_agent._sessions:
        support_agent._sessions[session_id]["merchant_id"] = request.merchant_id
        support_agent._sessions[session_id]["auto_generated"] = False 
    
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
    Returns ONLY the final resolution to the merchant.
    Filters out all 'thinking', 'diagnoses', and 'reasoning'.
    
    This is the boundary control endpoint - merchants never see:
    - AI reasoning
    - Risk assessments
    - Confidence scores
    - Internal explanations
    
    When status is DISPATCHED, returns structured fix data:
    - fix_type: "code_change" | "cli_command" | "manual_steps"
    - file_path: For code changes only
    - solution: The actual fix content
    - description: Why this fix works
    """
    import json
    
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
            # Get draft content from the action
            if hasattr(action, 'draft_content'):
                draft_content = action.draft_content
            else:
                draft_content = action.get("draft_content", "{}")
            
            # Try to parse as JSON (new structured format)
            try:
                fix_data = json.loads(draft_content)
                return {
                    "status": "resolved",
                    "type": fix_data.get("fix_type", "manual_steps"),
                    "file": fix_data.get("file_path"),
                    "solution": fix_data.get("content", "See solution details below."),
                    "description": fix_data.get("explanation", "Fix has been approved by our team."),
                    "estimated_time": fix_data.get("estimated_time", "5-10 minutes"),
                    "risk_level": fix_data.get("risk_level", "low")
                }
            except (json.JSONDecodeError, TypeError):
                # Fallback for older unstructured responses
                return {
                    "status": "resolved",
                    "type": "manual_steps",
                    "file": None,
                    "solution": draft_content,
                    "description": "A resolution has been approved by our engineering team.",
                    "estimated_time": "Unknown",
                    "risk_level": "medium"
                }
        else:
            return {
                "status": "resolved",
                "type": "manual_steps",
                "file": None,
                "solution": "Your issue has been resolved. Please check our documentation for details.",
                "description": "Fix has been applied.",
                "estimated_time": "N/A",
                "risk_level": "low"
            }
    
    # Status is still in review
    return {
        "status": "in_review",
        "message": "Our automated agent is analyzing the issue. Support will review and approve a fix shortly."
    }


@router.get("/merchant/history/{merchant_id}")
async def get_merchant_session_history(merchant_id: str):
    sessions = []
    print(f"DEBUG: Fetching history for {merchant_id}") # Check your terminal logs for this!
    
    for s_id, session in support_agent._sessions.items():
        s_data = session if isinstance(session, dict) else session.model_dump()
        
        # DEBUG: Print what we find to the console
        if s_data.get("merchant_id") == merchant_id:
            status = s_data.get("status")
            if hasattr(status, 'value'):
                status_val = status.value
            else:
                status_val = str(status)

            print(f"DEBUG: Found session {s_id} with status {status_val}")
            
            # ALLOW ALL STATUSES for now to verify data flow
            # We can filter strictly later once we see data appearing
            
            # Safe retrieval of nested fields
            diagnosis = s_data.get("diagnosis")
            confidence = diagnosis.confidence if diagnosis else 0
            
            proposed_action = s_data.get("proposed_action")
            solution = None
            if proposed_action:
                if hasattr(proposed_action, 'draft_content'):
                    solution = proposed_action.draft_content
                else:
                    solution = proposed_action.get("draft_content")

            sessions.append({
                "id": s_id,
                "status": status_val,
                "timestamp": s_data.get("started_at"),
                "diagnosis": diagnosis,
                "solution": solution,
                "confidence": confidence,
                "is_auto_detected": s_data.get("auto_generated", False)
            })
            
    sessions.sort(key=lambda x: str(x["timestamp"]), reverse=True)
    return {"sessions": sessions}
