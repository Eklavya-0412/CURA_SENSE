"""
Support Agent Service - Main Entry Point.
Orchestrates the LangGraph workflow and provides a simple API.
"""

import uuid
import asyncio
from typing import List, Dict, Any, Optional
from datetime import datetime

from models.types import (
    SupportTicket, ErrorLog, Issue, AgentOutput,
    HealingSession, HealingStatus, RootCause, RiskLevel,
    MigrationStage, ApprovalRequest
)
from agents.graph import create_initial_state, SupportAgentState, compile_support_agent
from agents import nodes
from langgraph.checkpoint.memory import MemorySaver

# Global memory instance - shared across all requests
memory = MemorySaver()



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
                ts = t.get("timestamp")
                timestamp = datetime.fromisoformat(ts) if ts else datetime.now()
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
                ts = e.get("timestamp")
                timestamp = datetime.fromisoformat(ts) if ts else datetime.now()
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
        initial_state = create_initial_state(session_id, ticket_models, error_models)
        
        # Use the compiled graph with global memory and unique thread_id
        app = compile_support_agent(memory)
        config = {"configurable": {"thread_id": session_id}}
        
        # Execute the graph until it hits the interrupt (wait_for_approval if needed)
        await app.ainvoke(initial_state, config=config)
        
        # Retrieve the state where the graph paused or completed
        snapshot = await app.aget_state(config)
        state = snapshot.values
        
        # Store session for retrieval
        self._sessions[session_id] = state
        
        # Check if approval is required
        if state.get("requires_human_approval"):
            self._add_to_approval_queue(session_id, state)
            self._metrics["human_escalated"] += 1
        else:
            # If no approval needed, graph should have completed
            self._metrics["auto_resolved"] += 1
        
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
        
        if not diagnosis:
            return
        
        # Create placeholder action if not yet generated (will be generated in act node after approval)
        if not proposed_action:
            from models.types import ProposedAction, ActionType
            action_type = state.get("action_type", ActionType.REQUEST_HUMAN_REVIEW)
            proposed_action = ProposedAction(
                action_type=action_type,
                draft_content="Action will be generated after approval.",
                target_audience="pending",
                steps=[]
            )
        
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
        """Get all pending approvals - formatted for frontend ApprovalCard component"""
        return [
            {
                "id": req.id,
                "session_id": req.session_id,
                "proposed_action": {
                    "type": req.proposed_action.action_type.value,
                    "draft_content": req.proposed_action.draft_content[:500],
                    "target": req.proposed_action.target_audience
                },
                "diagnosis": {
                    "root_cause": req.diagnosis.root_cause.value,
                    "confidence": req.diagnosis.confidence
                },
                "risk_assessment": {
                    "risk_level": req.risk_assessment.risk_level.value if req.risk_assessment else "unknown"
                },
                "risk": req.risk_assessment.risk_level.value if req.risk_assessment else "unknown",
                "explanation": req.explanation[:500],
                "status": req.status,
                "created_at": req.created_at.isoformat()
            }
            for req in self._approval_queue
            if req.status == "pending"
        ]
    
    async def analyze_async(self, client_message: str, merchant_id: str = "unknown") -> str:
        """Entry point for Client Side HTTP requests."""
        session_id = str(uuid.uuid4())
        
        # 1. Initialize session with the raw message
        self._sessions[session_id] = {
            "session_id": session_id,
            "status": HealingStatus.ANALYZING,
            "client_message": client_message,
            "progress": 0,
            "created_at": datetime.now()
        }

        # 2. Convert raw message into a structured Ticket for the Graph
        ticket_models = [SupportTicket(
            id=str(uuid.uuid4()),
            merchant_id=merchant_id,
            subject="Client-Initiated Support",
            description=client_message,
            migration_stage=MigrationStage.UNKNOWN,
            priority="medium"
        )]

        # 3. Trigger background workflow
        asyncio.create_task(self._run_analysis_workflow(session_id, ticket_models, []))
        return session_id

    async def _run_analysis_workflow(self, session_id: str, ticket_models: List[SupportTicket], error_models: List[ErrorLog]):
        """Background task to run the analysis workflow."""
        try:
            # Initialize state
            initial_state = create_initial_state(session_id, ticket_models, error_models)
            
            # Use the compiled graph with global memory and unique thread_id
            app = compile_support_agent(memory)
            config = {"configurable": {"thread_id": session_id}}
            
            # Execute the graph until it hits the interrupt
            await app.ainvoke(initial_state, config=config)
            
            # Retrieve the state where the graph paused or completed
            snapshot = await app.aget_state(config)
            state = snapshot.values
            
            # Update session with graph state
            self._sessions[session_id].update(state)
            self._sessions[session_id]["status"] = state.get("status", HealingStatus.AWAITING_APPROVAL)
            
            # Track special flags for dashboard
            self._sessions[session_id]["is_emergency"] = state.get("is_emergency", False)
            self._sessions[session_id]["abnormal_pattern"] = state.get("abnormal_pattern", False)
            self._sessions[session_id]["volume_spike"] = state.get("volume_spike", False)
            self._sessions[session_id]["is_autofix"] = state.get("is_autofix", False)
            
            # Check if this is an auto-fix case (no approval required)
            if state.get("is_autofix") and not state.get("requires_human_approval"):
                # AUTO-FIX: Execute immediately without human approval
                self._sessions[session_id]["status"] = HealingStatus.COMPLETED
                self._sessions[session_id]["auto_fixed_at"] = datetime.now()
                self._metrics["auto_resolved"] += 1
                
                # Log the auto-fix
                print(f"[AUTO-FIX] Session {session_id} resolved automatically (confidence: {state.get('diagnosis', {}).confidence if hasattr(state.get('diagnosis', {}), 'confidence') else 'N/A'})")
            
            # Check if approval is required (emergency, abnormal, or standard)
            elif state.get("requires_human_approval"):
                self._add_to_approval_queue(session_id, state)
                self._metrics["human_escalated"] += 1
                
                # Special handling for emergencies
                if state.get("is_emergency"):
                    print(f"[🚨 EMERGENCY] Session {session_id} flagged for urgent engineering review!")
            else:
                self._metrics["auto_resolved"] += 1
                
        except Exception as e:
            self._sessions[session_id]["status"] = HealingStatus.FAILED
            self._sessions[session_id]["error"] = str(e)

    async def approve_action(self, approval_id: str, approved: bool, reviewer_notes: str = None, actual_resolution: str = None) -> Dict[str, Any]:
        """Server-side approval: Resumes graph and marks as DISPATCHED."""
        # 1. Locate the request in queue
        request = next((r for r in self._approval_queue if r.id == approval_id), None)
        if not request:
            return {"success": False, "error": "Approval request not found"}

        session_id = request.session_id
        config = {"configurable": {"thread_id": session_id}}
        app = compile_support_agent(memory)

        if approved:
            # 1. Immediately update internal session state to 'dispatched'
            self._sessions[session_id]["status"] = HealingStatus.DISPATCHED
            self._sessions[session_id]["dispatched_at"] = datetime.now()
            
            # 2. Update graph state to approved and DISPATCHED
            await app.aupdate_state(config, {"approval_status": "approved", "status": HealingStatus.DISPATCHED})
            
            # 3. Resume graph execution to trigger LEARN node
            await app.ainvoke(None, config=config)
            request.status = "approved"
            
            # 4. Check if learning occurred and update metrics
            final_snapshot = await app.aget_state(config)
            final_state = final_snapshot.values
            if final_state.get("is_learning_candidate") and final_state.get("approval_status") == "approved":
                self._metrics["learning_events"] += 1
            
            # 5. Update session with final state from graph
            self._sessions[session_id].update(final_state)
            self._sessions[session_id]["status"] = HealingStatus.DISPATCHED  # Ensure it stays DISPATCHED
            
            return {"success": True, "message": "Solution dispatched to client.", "status": "dispatched", "session_id": session_id}
        else:
            # Mark as rejected - update both graph and session
            await app.aupdate_state(config, {"approval_status": "rejected", "status": HealingStatus.FAILED})
            request.status = "rejected"
            
            # Update session status immediately
            self._sessions[session_id]["status"] = HealingStatus.FAILED
            self._sessions[session_id]["rejection_reason"] = reviewer_notes

        request.reviewer_notes = reviewer_notes
        
        # Update session with final state
        final_snapshot = await app.aget_state(config)
        self._sessions[session_id].update(final_snapshot.values)
        
        return {"success": True, "status": request.status, "session_id": session_id}
    
    def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Get a session by ID - formatted for frontend"""
        state = self._sessions.get(session_id)
        if not state:
            return None
        
        return {
            "id": session_id,  # Frontend expects 'id'
            "session_id": session_id,
            "status": state.get("status", HealingStatus.OBSERVING).value,
            "started_at": datetime.now().isoformat(),  # Placeholder for frontend
            "is_systemic": state.get("is_systemic", False),
            "requires_approval": state.get("requires_human_approval", False),
            "approval_status": state.get("approval_status", "pending"),
            "diagnosis": {
                "root_cause": state["diagnosis"].root_cause.value,
                "confidence": state["diagnosis"].confidence
            } if state.get("diagnosis") else None,
            "risk": state["risk_assessment"].risk_level.value if state.get("risk_assessment") else None,
            "explanation": state.get("explanation", ""),
            # New flags for dashboard alerts
            "is_emergency": state.get("is_emergency", False),
            "abnormal_pattern": state.get("abnormal_pattern", False),
            "volume_spike": state.get("volume_spike", False),
            "is_autofix": state.get("is_autofix", False),
            "spike_count": state.get("spike_count", 0)
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
