"""
Support Agent Service - Main Entry Point.
Orchestrates the LangGraph workflow and provides a simple API.
"""

import uuid
from typing import List, Dict, Any, Optional
from datetime import datetime

from models.types import (
    SupportTicket, ErrorLog, Issue, AgentOutput,
    HealingSession, HealingStatus, RootCause, RiskLevel,
    MigrationStage, ApprovalRequest
)
from agents.graph import create_initial_state, SupportAgentState
from agents import nodes


class SupportAgentService:
    """
    Main service for the MigraGuard Support Agent.
    
    Implements the 10-step workflow from the system prompt:
    1. OBSERVE - Parse inputs
    2. CLUSTER - Group similar issues
    3. SEARCH KNOWLEDGE - RAG search
    4. REASON - Diagnose root cause
    5. RISK ASSESSMENT - Calculate impact
    6. DECIDE ACTION - Choose response type
    7. ACT - Draft response (no auto-send)
    8. EXPLAIN - Provide reasoning
    9. HUMAN-IN-LOOP - Wait for approval if needed
    10. LEARN - Store verified resolutions
    """
    
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        if not hasattr(self, '_initialized'):
            self._sessions: Dict[str, SupportAgentState] = {}
            self._approval_queue: List[ApprovalRequest] = []
            self._metrics = {
                "total_sessions": 0,
                "auto_resolved": 0,
                "human_escalated": 0,
                "learning_events": 0
            }
            self._initialized = True
    
    async def analyze(
        self,
        tickets: List[Dict[str, Any]] = None,
        errors: List[Dict[str, Any]] = None
    ) -> AgentOutput:
        """
        Main entry point - analyze tickets/errors through the 10-step workflow.
        
        Returns the structured AgentOutput matching the system prompt format.
        """
        session_id = str(uuid.uuid4())
        self._metrics["total_sessions"] += 1
        
        # Convert dicts to models
        ticket_models = []
        if tickets:
            for t in tickets:
                # Handle timestamp - must check for actual value, not just key presence
                ts = t.get("timestamp")
                timestamp = datetime.fromisoformat(ts) if ts else datetime.now()
                
                # Handle ID - check if it exists and is not None
                t_id = t.get("id")
                ticket_id = t_id if t_id else str(uuid.uuid4())

                ticket = SupportTicket(
                    id=ticket_id,
                    merchant_id=t.get("merchant_id", "unknown"),
                    subject=t.get("subject", ""),
                    description=t.get("description", ""),
                    migration_stage=MigrationStage(t.get("migration_stage", "unknown")),
                    priority=t.get("priority", "medium"),
                    timestamp=timestamp
                )
                ticket_models.append(ticket)
        
        error_models = []
        if errors:
            for e in errors:
                # Handle timestamp - must check for actual value
                ts = e.get("timestamp")
                timestamp = datetime.fromisoformat(ts) if ts else datetime.now()
                
                # Handle ID - check if it exists and is not None
                e_id = e.get("id")
                error_id = e_id if e_id else str(uuid.uuid4())

                error = ErrorLog(
                    id=error_id,
                    merchant_id=e.get("merchant_id"),
                    error_code=e.get("error_code", "UNKNOWN"),
                    error_message=e.get("error_message", ""),
                    stack_trace=e.get("stack_trace"),
                    endpoint=e.get("endpoint"),
                    migration_stage=MigrationStage(e.get("migration_stage", "unknown")),
                    timestamp=timestamp
                )
                error_models.append(error)
        
        # Initialize state
        state = create_initial_state(session_id, ticket_models, error_models)
        
        # Run through the workflow steps
        # Step 1: Observe
        state = nodes.observe_node(state)
        
        # Step 2: Cluster
        state = nodes.cluster_node(state)
        
        # Step 3: Search Knowledge
        state = nodes.search_knowledge_node(state)
        
        # Step 4: Diagnose (async)
        state = await nodes.diagnose_node(state)
        
        # Step 5: Risk Assessment
        state = nodes.assess_risk_node(state)
        
        # Step 6: Decide Action
        state = nodes.decide_action_node(state)
        
        # Step 7: Act (async)
        state = await nodes.act_node(state)
        
        # Step 8: Explain
        state = nodes.explain_node(state)
        
        # Store session
        self._sessions[session_id] = state
        
        # If requires approval, add to queue
        if state.get("requires_human_approval", False):
            self._metrics["human_escalated"] += 1
            self._add_to_approval_queue(session_id, state)
        else:
            self._metrics["auto_resolved"] += 1
        
        # Build output
        return self._build_output(session_id, state)
    
    def _build_output(self, session_id: str, state: SupportAgentState) -> AgentOutput:
        """Build the AgentOutput from state"""
        diagnosis = state.get("diagnosis")
        risk_assessment = state.get("risk_assessment")
        proposed_action = state.get("proposed_action")
        
        # Get observed pattern summary
        clusters = state.get("clusters", [])
        if clusters:
            main_cluster = max(clusters, key=lambda c: len(c.issues))
            observed_pattern = f"Observed {len(main_cluster.issues)} related issues affecting {len(main_cluster.affected_merchants)} merchants"
            if state.get("is_systemic"):
                observed_pattern += " (SYSTEMIC)"
        else:
            observed_pattern = "No clear pattern identified"
        
        # Get sources used
        sources = [ks.source_type for ks in state.get("knowledge_sources", [])]
        
        return AgentOutput(
            observed_pattern=observed_pattern,
            root_cause=diagnosis.root_cause.value if diagnosis else "unknown",
            confidence=diagnosis.confidence if diagnosis else 0.0,
            risk=risk_assessment.risk_level.value if risk_assessment else "low",
            recommended_action=proposed_action.draft_content if proposed_action else "No action generated",
            requires_human_approval=state.get("requires_human_approval", False),
            explanation=state.get("explanation", ""),
            learning_candidate=state.get("is_learning_candidate", False),
            sources_used=list(set(sources))
        )
    
    def _add_to_approval_queue(self, session_id: str, state: SupportAgentState):
        """Add a session to the approval queue"""
        diagnosis = state.get("diagnosis")
        risk_assessment = state.get("risk_assessment")
        proposed_action = state.get("proposed_action")
        
        if not diagnosis or not proposed_action:
            return
        
        request = ApprovalRequest(
            id=str(uuid.uuid4()),
            session_id=session_id,
            proposed_action=proposed_action,
            diagnosis=diagnosis,
            risk_assessment=risk_assessment,
            explanation=state.get("explanation", ""),
            created_at=datetime.now(),
            status="pending"
        )
        
        self._approval_queue.append(request)
    
    def get_approval_queue(self) -> List[Dict[str, Any]]:
        """Get all pending approvals"""
        return [
            {
                "id": req.id,
                "session_id": req.session_id,
                "proposed_action": {
                    "type": req.proposed_action.action_type.value,
                    "draft": req.proposed_action.draft_content[:500],
                    "target": req.proposed_action.target_audience
                },
                "diagnosis": {
                    "root_cause": req.diagnosis.root_cause.value,
                    "confidence": req.diagnosis.confidence
                },
                "risk": req.risk_assessment.risk_level.value if req.risk_assessment else "unknown",
                "explanation": req.explanation[:500],
                "status": req.status,
                "created_at": req.created_at.isoformat()
            }
            for req in self._approval_queue
            if req.status == "pending"
        ]
    
    async def approve_action(
        self,
        approval_id: str,
        approved: bool,
        reviewer_notes: str = None,
        actual_resolution: str = None
    ) -> Dict[str, Any]:
        """Approve or reject a pending action"""
        # Find the approval request
        request = None
        for req in self._approval_queue:
            if req.id == approval_id:
                request = req
                break
        
        if not request:
            return {"success": False, "error": "Approval request not found"}
        
        # Update status
        request.status = "approved" if approved else "rejected"
        request.reviewer_notes = reviewer_notes
        
        # Get session state
        state = self._sessions.get(request.session_id)
        if not state:
            return {"success": False, "error": "Session not found"}
        
        # Update state
        state["approval_status"] = "approved" if approved else "rejected"
        
        # If approved and is learning candidate, run learning step
        if approved and state.get("is_learning_candidate", False):
            state = await nodes.learn_node(state)
            self._metrics["learning_events"] += 1
        
        return {
            "success": True,
            "status": request.status,
            "session_id": request.session_id
        }
    
    def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Get a session by ID"""
        state = self._sessions.get(session_id)
        if not state:
            return None
        
        return {
            "session_id": session_id,
            "status": state.get("status", HealingStatus.OBSERVING).value,
            "is_systemic": state.get("is_systemic", False),
            "requires_approval": state.get("requires_human_approval", False),
            "approval_status": state.get("approval_status", "pending"),
            "diagnosis": {
                "root_cause": state["diagnosis"].root_cause.value,
                "confidence": state["diagnosis"].confidence
            } if state.get("diagnosis") else None,
            "risk": state["risk_assessment"].risk_level.value if state.get("risk_assessment") else None,
            "explanation": state.get("explanation", "")
        }
    
    def get_metrics(self) -> Dict[str, Any]:
        """Get agent metrics"""
        total = self._metrics["total_sessions"]
        auto = self._metrics["auto_resolved"]
        
        return {
            "total_sessions": total,
            "auto_resolved_count": auto,
            "human_escalated_count": self._metrics["human_escalated"],
            "learning_events_count": self._metrics["learning_events"],
            "pending_approvals": len([r for r in self._approval_queue if r.status == "pending"]),
            "success_rate": (auto / total) if total > 0 else 0.0,
            "completed_sessions": auto + self._metrics["human_escalated"],
            "failed_sessions": 0,
            "avg_resolution_time_seconds": 0.0
        }
    
    def get_recent_sessions(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Get recent sessions"""
        sessions = list(self._sessions.items())[-limit:]
        return [
            self.get_session(session_id)
            for session_id, _ in sessions
        ]


# Singleton instance
support_agent = SupportAgentService()
