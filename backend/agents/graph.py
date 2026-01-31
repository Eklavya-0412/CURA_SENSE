"""
LangGraph State Graph for the Support Agent Workflow.
Adapted from self-healing-framework architecture:
- Monitor Agent → Ticket Ingestion Node
- Healer Agent → LangChain Agent with Tools
- Validator Agent → Python Validation Functions
"""

from typing import TypedDict, List, Optional, Annotated
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from langchain_core.messages import BaseMessage
import operator

from models.types import (
    SupportTicket, ErrorLog, Issue, IssueCluster,
    KnowledgeSource, HistoricalSolution,
    Diagnosis, RiskAssessment, ProposedAction,
    HealingStatus, RootCause, RiskLevel, ActionType
)


# ============ Graph State ============

class SupportAgentState(TypedDict):
    """
    State that flows through the LangGraph workflow.
    Each node reads and updates this state.
    """
    # Session info
    session_id: str
    status: HealingStatus
    
    # Inputs
    tickets: List[SupportTicket]
    errors: List[ErrorLog]
    
    # Step 1: Observe
    observed_issues: List[Issue]
    
    # Step 2: Cluster
    clusters: List[IssueCluster]
    is_systemic: bool
    
    # Step 3: Search Knowledge
    knowledge_sources: List[KnowledgeSource]
    historical_solutions: List[HistoricalSolution]
    
    # Step 4: Diagnose (Reason)
    diagnosis: Optional[Diagnosis]
    
    # Step 5: Risk Assessment
    risk_assessment: Optional[RiskAssessment]
    
    # Step 6: Decide Action
    action_type: Optional[ActionType]
    requires_human_approval: bool
    
    # Step 7: Act (Draft)
    proposed_action: Optional[ProposedAction]
    fix_data: Optional[dict]  # Structured fix data containing type, content, etc.
    
    # Step 8: Explanation
    explanation: str
    
    # Step 9: Human-in-Loop
    approval_status: str  # pending, approved, rejected
    
    # Step 10: Learning
    is_learning_candidate: bool
    
    # Messages for agent reasoning
    messages: Annotated[List[BaseMessage], add_messages]
    
    # Error tracking
    error: Optional[str]


def create_initial_state(
    session_id: str,
    tickets: List[SupportTicket] = None,
    errors: List[ErrorLog] = None
) -> SupportAgentState:
    """Create initial state for a new session"""
    return SupportAgentState(
        session_id=session_id,
        status=HealingStatus.OBSERVING,
        tickets=tickets or [],
        errors=errors or [],
        observed_issues=[],
        clusters=[],
        is_systemic=False,
        knowledge_sources=[],
        historical_solutions=[],
        diagnosis=None,
        risk_assessment=None,
        action_type=None,
        requires_human_approval=False,
        proposed_action=None,
        fix_data=None,
        explanation="",
        approval_status="pending",
        is_learning_candidate=False,
        messages=[],
        error=None
    )


# ============ Conditional Edges ============

def should_require_approval(state: SupportAgentState) -> str:
    """
    Determine if human approval is required.
    Rule: IF risk == high OR confidence < 0.85 → human approval required
    """
    risk = state.get("risk_assessment")
    diagnosis = state.get("diagnosis")
    
    if risk and risk.risk_level == RiskLevel.HIGH:
        return "require_approval"
    
    if diagnosis and diagnosis.confidence < 0.85:
        return "require_approval"
    
    return "auto_proceed"


def check_approval_status(state: SupportAgentState) -> str:
    """Check if approval was granted"""
    status = state.get("approval_status", "pending")
    
    if status == "approved":
        return "approved"
    elif status == "rejected":
        return "rejected"
    else:
        return "waiting"


def should_learn(state: SupportAgentState) -> str:
    """Determine if this session should be added to learning memory"""
    if state.get("is_learning_candidate", False):
        return "learn"
    return "skip_learning"


# ============ Build Graph ============

def build_support_agent_graph() -> StateGraph:
    """
    Build the LangGraph StateGraph for the support agent workflow.
    
    Flow:
    1. observe → 2. cluster → 3. search_knowledge → 4. diagnose →
    5. assess_risk → 6. decide_action → [conditional: require_approval?]
    
    If approval required:
        → 9. wait_for_approval → [conditional: approved?]
            → approved: 7. act → 8. explain → 10. learn → END
            → rejected: END
    
    If auto proceed:
        → 7. act → 8. explain → 10. learn → END
    """
    
    # Create the graph
    workflow = StateGraph(SupportAgentState)
    
    # Import nodes (will be defined in nodes.py)
    from agents.nodes import (
        observe_node,
        cluster_node,
        search_knowledge_node,
        diagnose_node,
        assess_risk_node,
        decide_action_node,
        act_node,
        explain_node,
        wait_for_approval_node,
        learn_node
    )
    
    # Add nodes
    workflow.add_node("observe", observe_node)
    workflow.add_node("cluster", cluster_node)
    workflow.add_node("search_knowledge", search_knowledge_node)
    workflow.add_node("diagnose", diagnose_node)
    workflow.add_node("assess_risk", assess_risk_node)
    workflow.add_node("decide_action", decide_action_node)
    workflow.add_node("act", act_node)
    workflow.add_node("explain", explain_node)
    workflow.add_node("wait_for_approval", wait_for_approval_node)
    workflow.add_node("learn", learn_node)
    
    # Set entry point
    workflow.set_entry_point("observe")
    
    # Add edges (linear flow until decision point)
    workflow.add_edge("observe", "cluster")
    workflow.add_edge("cluster", "search_knowledge")
    workflow.add_edge("search_knowledge", "diagnose")
    workflow.add_edge("diagnose", "assess_risk")
    workflow.add_edge("assess_risk", "decide_action")
    
    # NEW FLOW: decide -> act (Draft) -> explain -> check approval
    # We generate the draft FIRST so it can be reviewed
    workflow.add_edge("decide_action", "act")
    workflow.add_edge("act", "explain")
    
    # Conditional edge: require approval or auto-proceed (AFTER explain)
    workflow.add_conditional_edges(
        "explain",
        should_require_approval,
        {
            "require_approval": "wait_for_approval",
            "auto_proceed": "learn"  # Skip wait, go directly to learn
        }
    )
    
    # From approval wait, usually we stop here until API resumes
    # When API resumes (approved), we go to learn
    workflow.add_edge("wait_for_approval", "learn")
    
    # After learn, end
    workflow.add_edge("learn", END)
    
    return workflow




def compile_support_agent(memory):
    """Compile the support agent graph with the provided memory checkpointer."""
    workflow = build_support_agent_graph()
    
    # interrupt_before=["wait_for_approval"] pauses execution when approval is needed
    # This allows the approve_action API to resume the graph later
    return workflow.compile(
        checkpointer=memory,
        interrupt_before=["wait_for_approval"]
    )
