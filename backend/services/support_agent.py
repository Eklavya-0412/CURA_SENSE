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
    MigrationStage, ApprovalRequest, Diagnosis, RiskAssessment,
    ProposedAction, ActionType
)
from agents.graph import create_initial_state, SupportAgentState, compile_support_agent
from agents import nodes
from langgraph.checkpoint.memory import MemorySaver

# Global memory instance - shared across all requests
memory = MemorySaver()

# Human-readable labels for where a ticket came from
SOURCE_LABELS = {
    "merchant_portal": "merchant portal",
    "webhook": "error webhook",
    "monitor": "live monitor",
    "api": "client API",
    "demo": "demo seed",
}


def _enum_value(value):
    return value.value if hasattr(value, "value") else value


def _humanize(value) -> str:
    return str(_enum_value(value) or "").replace("_", " ")


def summarize_node_update(node: str, update: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Turn one LangGraph node update into an activity-log entry.
    Only reads fields the node actually produced; returns None for nothing to log.
    """
    if not isinstance(update, dict):
        return None

    if node == "observe":
        issues = update.get("observed_issues") or []
        return {"level": "info", "message": f"Parsed {len(issues)} issue(s) from the incoming signal"}

    if node == "cluster":
        clusters = update.get("clusters") or []
        merchants = {m for c in clusters for m in (getattr(c, "affected_merchants", None) or [])}
        message = f"Grouped into {len(clusters)} cluster(s) across {len(merchants) or 1} merchant(s)"
        if update.get("is_systemic"):
            return {"level": "warning", "message": message + " — systemic pattern detected"}
        return {"level": "info", "message": message}

    if node == "search_knowledge":
        sources = update.get("knowledge_sources") or []
        past = update.get("historical_solutions") or []
        names = []
        for s in sources:
            meta = getattr(s, "metadata", {}) or {}
            name = meta.get("source") or getattr(s, "source_type", None)
            if name and name not in names:
                names.append(name)
        return {
            "level": "info",
            "message": f"Retrieved {len(sources)} knowledge source(s) and {len(past)} past incident(s)",
            "detail": ", ".join(names[:6]) or None,
        }

    if node == "diagnose":
        diagnosis = update.get("diagnosis")
        if not diagnosis:
            return {"level": "warning", "message": "Diagnosis produced no result"}
        return {
            "level": "info",
            "message": f"Root cause: {_humanize(diagnosis.root_cause)} ({diagnosis.confidence:.0%} confidence)",
            "detail": (diagnosis.reasoning or "")[:400] or None,
        }

    if node == "assess_risk":
        risk = update.get("risk_assessment")
        if not risk:
            return None
        flags = [label for flag, label in ((risk.affects_checkout, "checkout"), (risk.affects_revenue, "revenue")) if flag]
        level = _enum_value(risk.risk_level)
        message = f"Risk {level}: {risk.affected_merchants_count} merchant(s) affected"
        if flags:
            message += f", impacts {' and '.join(flags)}"
        return {
            "level": "warning" if level in ("high", "critical") else "info",
            "message": message,
            "detail": (risk.reasoning or "")[:400] or None,
        }

    if node == "decide_action":
        action = _humanize(update.get("action_type")) or "no action"
        if update.get("requires_human_approval"):
            return {"level": "warning", "message": f"Selected '{action}' — human approval required"}
        return {"level": "info", "message": f"Selected '{action}' — eligible for auto-resolution"}

    if node == "act":
        action = update.get("proposed_action")
        fix = update.get("fix_data") or {}
        fix_type = _humanize(fix.get("fix_type")) if isinstance(fix, dict) else ""
        if not action:
            return {"level": "info", "message": "No fix drafted"}
        return {
            "level": "info",
            "message": f"Drafted {fix_type or 'response'} for {action.target_audience}",
        }

    if node == "explain":
        return {"level": "info", "message": "Generated reasoning summary for reviewers"}

    if node == "wait_for_approval":
        return {"level": "info", "message": "Resumed after human decision"}

    if node == "learn":
        if update.get("is_learning_candidate"):
            return {"level": "success", "message": "Verified resolution stored for future incidents"}
        return {"level": "success", "message": "Workflow completed"}

    return {"level": "info", "message": f"{_humanize(node).capitalize()} completed"}



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
            self._seed_default_demo_data()
            self._initialized = True

    # ------------------------------------------------------------------
    # Activity log
    # ------------------------------------------------------------------
    def _log(self, session_id: str, stage: str, message: str, level: str = "info",
             detail: Optional[str] = None, duration_ms: Optional[int] = None,
             at: Optional[datetime] = None):
        """Append an entry to a session's activity log (shown in the operations console)."""
        session = self._sessions.get(session_id)
        if session is None:
            return
        entry = {
            "ts": (at or datetime.now()).isoformat(),
            "stage": stage,
            "level": level,
            "message": message,
        }
        if detail:
            entry["detail"] = detail
        if duration_ms is not None:
            entry["duration_ms"] = duration_ms
        session.setdefault("activity_log", []).append(entry)

    async def _run_graph(self, app, graph_input, config, session_id: str):
        """
        Run the graph node by node (same execution as ainvoke) and log each
        node as it finishes, with how long it took.
        """
        last = datetime.now()
        async for chunk in app.astream(graph_input, config=config, stream_mode="updates"):
            if not isinstance(chunk, dict):
                continue
            for node, update in chunk.items():
                if node.startswith("__"):
                    continue
                now = datetime.now()
                try:
                    entry = summarize_node_update(node, update)
                except Exception as exc:  # logging must never break the workflow
                    entry = {"level": "info", "message": f"{node} completed", "detail": f"log summary failed: {exc}"}
                if entry:
                    self._log(
                        session_id, node, entry["message"], entry.get("level", "info"),
                        entry.get("detail"), int((now - last).total_seconds() * 1000), at=now,
                    )
                last = now

    def _seed_default_demo_data(self):
        """Pre-populate realistic demo sessions so dashboard is instantly populated on startup."""
        sample_incidents = [
            {
                "session_id": "SES-DEMO-001",
                "merchant_id": "MCH-1001",
                "status": HealingStatus.DISPATCHED,
                "root_cause": RootCause.MERCHANT_MISCONFIGURATION,
                "confidence": 0.95,
                "risk": RiskLevel.LOW,
                "requires_approval": False,
                "explanation": "Merchant webhook endpoint returned 404 due to an invalid path configuration after migrating to the v2 orders API.",
                "action": "Updated webhook endpoint destination to https://mystore.com/api/v2/webhooks and re-dispatched test event successfully.",
                "action_type": ActionType.PROVIDE_SETUP_INSTRUCTIONS
            },
            {
                "session_id": "SES-DEMO-002",
                "merchant_id": "MCH-1002",
                "status": HealingStatus.DISPATCHED,
                "root_cause": RootCause.DOCUMENTATION_GAP,
                "confidence": 0.88,
                "risk": RiskLevel.MEDIUM,
                "requires_approval": False,
                "explanation": "Bulk catalog sync exceeded burst rate limits. Documentation lacked header specification for batch uploads.",
                "action": "Provided correct exponential backoff client configuration and adjusted API tier quota limit.",
                "action_type": ActionType.DRAFT_SUPPORT_RESPONSE
            },
            {
                "session_id": "SES-DEMO-003",
                "merchant_id": "MCH-1003",
                "status": HealingStatus.AWAITING_APPROVAL,
                "root_cause": RootCause.PLATFORM_REGRESSION,
                "confidence": 0.92,
                "risk": RiskLevel.HIGH,
                "requires_approval": True,
                "explanation": "Checkout currency formatting reverted to USD for European storefronts due to unmapped locale headers in checkout container.",
                "action": "Patch checkout service locale fallback configuration to prioritize merchant store settings.",
                "action_type": ActionType.REQUEST_HUMAN_REVIEW
            },
            {
                "session_id": "SES-DEMO-004",
                "merchant_id": "MCH-1004",
                "status": HealingStatus.COMPLETED,
                "root_cause": RootCause.MERCHANT_MISCONFIGURATION,
                "confidence": 0.84,
                "risk": RiskLevel.LOW,
                "requires_approval": False,
                "explanation": "Product media assets failed CDN propagation due to expired CORS policy headers on merchant S3 bucket.",
                "action": "Generated updated CORS policy JSON and provided one-click deployment instructions.",
                "action_type": ActionType.PROVIDE_SETUP_INSTRUCTIONS
            },
            {
                "session_id": "SES-DEMO-005",
                "merchant_id": "MCH-1005",
                "status": HealingStatus.AWAITING_APPROVAL,
                "root_cause": RootCause.PLATFORM_REGRESSION,
                "confidence": 0.96,
                "risk": RiskLevel.HIGH,
                "requires_approval": True,
                "explanation": "Stripe payment gateway credentials failed handshake validation following v3 security certificates rotation.",
                "action": "Execute credentials re-sync and rotate merchant API webhook secrets.",
                "action_type": ActionType.ESCALATE_TO_ENGINEERING
            },
            {
                "session_id": "SES-DEMO-006",
                "merchant_id": "MCH-1001",
                "status": HealingStatus.DISPATCHED,
                "root_cause": RootCause.PLATFORM_REGRESSION,
                "confidence": 0.90,
                "risk": RiskLevel.MEDIUM,
                "requires_approval": False,
                "explanation": "Order status webhook processing queue experienced a 2-hour latency spike caused by Redis worker saturation.",
                "action": "Scaled Redis worker consumer replicas and cleared message acknowledgment backlog.",
                "action_type": ActionType.DRAFT_SUPPORT_RESPONSE
            }
        ]

        for inc in sample_incidents:
            s_id = inc["session_id"]
            if s_id in self._sessions:
                continue

            diagnosis = Diagnosis(
                root_cause=inc["root_cause"],
                confidence=inc["confidence"],
                reasoning=inc["explanation"]
            )
            risk_assessment = RiskAssessment(
                risk_level=inc["risk"],
                affected_merchants_count=1 if inc["risk"] == RiskLevel.LOW else 5,
                affects_checkout=(inc["risk"] == RiskLevel.HIGH),
                affects_revenue=(inc["risk"] == RiskLevel.HIGH),
                reasoning=inc["explanation"]
            )
            proposed_action = ProposedAction(
                action_type=inc["action_type"],
                draft_content=inc["action"],
                target_audience="merchant" if inc["risk"] == RiskLevel.LOW else "engineering",
                steps=[inc["action"]]
            )
            created = datetime.now()
            state = {
                "session_id": s_id,
                "merchant_id": inc["merchant_id"],
                "source": "demo",
                "status": inc["status"],
                "diagnosis": diagnosis,
                "risk_assessment": risk_assessment,
                "proposed_action": proposed_action,
                "explanation": inc["explanation"],
                "requires_human_approval": inc["requires_approval"],
                "is_systemic": inc["risk"] == RiskLevel.HIGH,
                "volume_spike": False,
                "abnormal_pattern": False,
                "timestamp": created,
                "created_at": created
            }
            self._sessions[s_id] = state
            self._log(s_id, "received", f"Demo incident seeded for {inc['merchant_id']}", at=created)
            self._log(s_id, "diagnose", f"Root cause: {_humanize(inc['root_cause'])} ({inc['confidence']:.0%} confidence)",
                      detail=inc["explanation"], at=created)
            self._log(s_id, "assess_risk", f"Risk {_enum_value(inc['risk'])}",
                      level="warning" if inc["risk"] == RiskLevel.HIGH else "info", at=created)
            self._log(s_id, "act", f"Drafted {_humanize(inc['action_type'])}", at=created)
            if inc["requires_approval"]:
                self._log(s_id, "approval", "Queued for human approval", level="warning", at=created)
            else:
                self._log(s_id, "dispatch", f"Resolution {_enum_value(inc['status'])}", level="success", at=created)
            self._metrics["total_sessions"] += 1
            if inc["requires_approval"]:
                self._metrics["human_escalated"] += 1
                self._add_to_approval_queue(s_id, state)
            else:
                self._metrics["auto_resolved"] += 1

    
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
        
        # Register the session up front so the activity log can be written during the run
        first = (ticket_models or error_models or [None])[0]
        merchant_id = getattr(first, "merchant_id", None) or "unknown"
        self._sessions[session_id] = {
            "session_id": session_id,
            "status": HealingStatus.OBSERVING,
            "merchant_id": merchant_id,
            "source": "api",
            "created_at": datetime.now(),
        }
        self._log(session_id, "received",
                  f"Batch of {len(ticket_models)} ticket(s) and {len(error_models)} error(s) received via analysis API")

        # Use the compiled graph with global memory and unique thread_id
        app = compile_support_agent(memory)
        config = {"configurable": {"thread_id": session_id}}

        # Execute the graph until it hits the interrupt (wait_for_approval if needed)
        await self._run_graph(app, initial_state, config, session_id)

        # Retrieve the state where the graph paused or completed
        snapshot = await app.aget_state(config)
        state = snapshot.values

        # Store session for retrieval
        self._sessions[session_id].update(state)

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
                "created_at": req.created_at.isoformat(),
                "merchant_id": self._sessions.get(req.session_id, {}).get("merchant_id") or "unknown",
                "source": self._sessions.get(req.session_id, {}).get("source"),
            }
            for req in self._approval_queue
            if req.status == "pending"
        ]
    
    async def analyze_async(self, client_message: str, merchant_id: str = "unknown", source: str = "api") -> str:
        """Entry point for Client Side HTTP requests."""
        session_id = str(uuid.uuid4())

        # 1. Initialize session with the raw message and who sent it
        self._sessions[session_id] = {
            "session_id": session_id,
            "status": HealingStatus.ANALYZING,
            "client_message": client_message,
            "merchant_id": merchant_id,
            "source": source,
            "progress": 0,
            "created_at": datetime.now()
        }
        self._log(
            session_id, "received",
            f"Ticket received from {merchant_id} via {SOURCE_LABELS.get(source, source)}",
            detail=client_message[:500] if client_message else None,
        )

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
            
            # Execute the graph until it hits the interrupt (logging each node)
            await self._run_graph(app, initial_state, config, session_id)

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
                self._log(session_id, "dispatch", "Auto-fix applied without approval (low risk, high confidence)", level="success")

                # Log the auto-fix
                print(f"[AUTO-FIX] Session {session_id} resolved automatically (confidence: {state.get('diagnosis', {}).confidence if hasattr(state.get('diagnosis', {}), 'confidence') else 'N/A'})")
            
            # Check if approval is required (emergency, abnormal, or standard)
            elif state.get("requires_human_approval"):
                self._add_to_approval_queue(session_id, state)
                self._metrics["human_escalated"] += 1
                self._log(session_id, "approval", "Queued for human approval (high risk or confidence below 85%)", level="warning")

                # Special handling for emergencies
                if state.get("is_emergency"):
                    print(f"[🚨 EMERGENCY] Session {session_id} flagged for urgent engineering review!")
                    self._log(session_id, "approval", "Flagged as emergency for urgent engineering review", level="error")
            else:
                self._metrics["auto_resolved"] += 1
                self._log(session_id, "dispatch", f"Workflow finished with status '{_enum_value(self._sessions[session_id]['status'])}'", level="success")

        except Exception as e:
            self._sessions[session_id]["status"] = HealingStatus.FAILED
            self._sessions[session_id]["error"] = str(e)
            self._log(session_id, "error", "Workflow failed", level="error", detail=str(e)[:500])

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
            self._log(session_id, "approval", "Fix approved by reviewer", level="success", detail=reviewer_notes)

            # 1. Immediately update internal session state to 'dispatched'
            self._sessions[session_id]["status"] = HealingStatus.DISPATCHED
            self._sessions[session_id]["dispatched_at"] = datetime.now()

            # 2. Update graph state to approved and DISPATCHED
            await app.aupdate_state(config, {"approval_status": "approved", "status": HealingStatus.DISPATCHED})

            # 3. Resume graph execution to trigger LEARN node
            await self._run_graph(app, None, config, session_id)
            self._log(session_id, "dispatch", "Solution dispatched to merchant", level="success")
            request.status = "approved"
            
            # 4. Check if learning occurred and update metrics
            final_snapshot = await app.aget_state(config)
            final_state = final_snapshot.values
            if final_state.get("is_learning_candidate") and final_state.get("approval_status") == "approved":
                self._metrics["learning_events"] += 1
            
            # 5. Update session with final state from graph
            self._sessions[session_id].update(final_state)
            self._sessions[session_id]["status"] = HealingStatus.DISPATCHED  
            self._sessions[session_id]["completed_at"] = datetime.now()
            
            return {"success": True, "message": "Solution dispatched to client.", "status": "dispatched", "session_id": session_id}
        else:
            # Mark as rejected - update both graph and session
            await app.aupdate_state(config, {"approval_status": "rejected", "status": HealingStatus.FAILED})
            request.status = "rejected"
            
            # Update session status immediately
            self._sessions[session_id]["status"] = HealingStatus.FAILED
            self._sessions[session_id]["rejection_reason"] = reviewer_notes
            self._log(session_id, "approval", "Fix rejected by reviewer", level="error", detail=reviewer_notes)

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
        
        # Find the approval_id for this session
        approval_request = next(
            (r for r in self._approval_queue if r.session_id == session_id),
            None
        )
        approval_id = approval_request.id if approval_request else None
        
        # Get the proposed action / fix content
        proposed_action = state.get("proposed_action")
        if proposed_action:
            if hasattr(proposed_action, 'draft_content'):
                recommended_action = proposed_action.draft_content
            else:
                recommended_action = proposed_action.get("draft_content", "")
        else:
            recommended_action = state.get("explanation", "AI is generating a solution...")
        
        # Get action type
        action_type = state.get("action_type")
        if action_type and hasattr(action_type, 'value'):
            action_type_str = action_type.value
        else:
            action_type_str = str(action_type) if action_type else None
        
        created_at = state.get("created_at") or state.get("timestamp")
        started_at = created_at.isoformat() if isinstance(created_at, datetime) else created_at

        # Original ticket text: merchant message, or the auto-generated ticket for webhook/monitor signals
        original = state.get("original_ticket") or {}
        client_message = state.get("client_message") or (original.get("description") if isinstance(original, dict) else None)

        # Evidence retrieved by the RAG step (trimmed for transport)
        evidence = []
        for ks in (state.get("knowledge_sources") or [])[:6]:
            meta = getattr(ks, "metadata", {}) or {}
            evidence.append({
                "source": meta.get("source") or getattr(ks, "source_type", "knowledge"),
                "type": getattr(ks, "source_type", None),
                "snippet": (getattr(ks, "content", "") or "")[:280],
                "score": round(getattr(ks, "relevance_score", 0.0) or 0.0, 3),
            })

        return {
            "id": session_id,  # Frontend expects 'id'
            "session_id": session_id,
            "approval_id": approval_id,  # Needed for approval endpoint
            "status": _enum_value(state.get("status", HealingStatus.OBSERVING)),
            "started_at": started_at,
            # Who raised the ticket and through which channel
            "merchant_id": state.get("merchant_id") or "unknown",
            "source": state.get("source") or ("webhook" if state.get("auto_generated") else "api"),
            "client_message": client_message,
            "activity_log": state.get("activity_log", []),
            "evidence": evidence,
            "error": state.get("error"),
            "rejection_reason": state.get("rejection_reason"),
            "is_systemic": state.get("is_systemic", False),
            "requires_approval": state.get("requires_human_approval", False),
            "approval_status": state.get("approval_status", "pending"),
            "diagnosis": {
                "root_cause": state["diagnosis"].root_cause.value,
                "confidence": state["diagnosis"].confidence
            } if state.get("diagnosis") else None,
            "risk": state["risk_assessment"].risk_level.value if state.get("risk_assessment") else None,
            "explanation": state.get("explanation", ""),
            "recommended_action": recommended_action,  # The fix content
            "action_type": action_type_str,  # e.g., "provide_setup_instructions"
            "fix_data": state.get("fix_data"),  # Structured fix data from act_node
            # Flags for dashboard alerts
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
