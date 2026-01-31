# Types adapted from self-healing-framework for Python/LangChain stack

from enum import Enum
from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field
from datetime import datetime


class RootCause(str, Enum):
    """Possible root causes for issues"""
    MERCHANT_MISCONFIGURATION = "merchant_misconfiguration"
    DOCUMENTATION_GAP = "documentation_gap"
    PLATFORM_REGRESSION = "platform_regression"
    UNKNOWN = "unknown"


class RiskLevel(str, Enum):
    """Risk levels for actions"""
    LOW = "low"      # Affects one merchant, no revenue risk
    MEDIUM = "medium"  # Affects few merchants or non-critical flows
    HIGH = "high"    # Affects many merchants, live checkout, or revenue


class IssueSeverity(str, Enum):
    """Issue severity levels"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class MigrationStage(str, Enum):
    """Merchant migration stages"""
    PRE_MIGRATION = "pre-migration"
    MID_MIGRATION = "mid-migration"
    POST_MIGRATION = "post-migration"
    UNKNOWN = "unknown"


class HealingStatus(str, Enum):
    """Status of a healing session"""
    OBSERVING = "observing"
    CLUSTERING = "clustering"
    SEARCHING = "searching"
    DIAGNOSING = "diagnosing"
    ASSESSING = "assessing"
    DECIDING = "deciding"
    ACTING = "acting"
    AWAITING_APPROVAL = "awaiting_approval"
    COMPLETED = "completed"
    FAILED = "failed"
    ANALYZING = "analyzing"  # Initial state when client submits
    DISPATCHED = "dispatched"  # Final state after server clicks 'Send to Client'


class ActionType(str, Enum):
    """Types of recommended actions"""
    PROVIDE_SETUP_INSTRUCTIONS = "provide_setup_instructions"
    DRAFT_SUPPORT_RESPONSE = "draft_support_response"
    ESCALATE_TO_ENGINEERING = "escalate_to_engineering"
    REQUEST_HUMAN_REVIEW = "request_human_review"


# ============ Input Models ============

class SupportTicket(BaseModel):
    """A support ticket from a merchant"""
    id: str
    merchant_id: str
    subject: str
    description: str
    migration_stage: MigrationStage = MigrationStage.UNKNOWN
    priority: str = "medium"
    timestamp: datetime = Field(default_factory=datetime.now)
    metadata: Dict[str, Any] = {}


class ErrorLog(BaseModel):
    """An error log from the system"""
    id: str
    merchant_id: Optional[str] = None
    error_code: str
    error_message: str
    stack_trace: Optional[str] = None
    endpoint: Optional[str] = None
    migration_stage: MigrationStage = MigrationStage.UNKNOWN
    timestamp: datetime = Field(default_factory=datetime.now)
    context: Dict[str, Any] = {}


class Issue(BaseModel):
    """Unified issue representation (adapted from self-healing-framework)"""
    id: str
    type: str
    error_message: str
    stack_trace: Optional[str] = None
    severity: IssueSeverity = IssueSeverity.MEDIUM
    migration_stage: MigrationStage = MigrationStage.UNKNOWN
    detected_at: datetime = Field(default_factory=datetime.now)
    merchant_id: Optional[str] = None
    context: Dict[str, Any] = {}


# ============ Clustering Models ============

class IssueCluster(BaseModel):
    """A cluster of similar issues"""
    cluster_id: str
    issues: List[Issue]
    representative_text: str
    migration_stages: List[str]
    affected_merchants: List[str]
    is_systemic: bool = False
    similarity_score: float = 0.0


# ============ Knowledge Models ============

class KnowledgeSource(BaseModel):
    """A source of knowledge retrieved from RAG"""
    content: str
    source_type: str  # "migration_docs", "error_patterns", "past_incidents"
    metadata: Dict[str, Any] = {}
    relevance_score: float = 0.0


class HistoricalSolution(BaseModel):
    """A historical solution from past incidents (adapted from self-healing-framework)"""
    id: str
    issue_type: str
    issue_message: str
    solution_description: str
    resolution_steps: List[str]
    success_rate: float
    application_count: int
    relevance_score: float = 0.0


# ============ Diagnosis Models ============

class Diagnosis(BaseModel):
    """Result of diagnosing an issue"""
    root_cause: RootCause
    confidence: float = Field(ge=0.0, le=1.0)
    reasoning: str
    supporting_evidence: List[str] = []


class RiskAssessment(BaseModel):
    """Result of risk assessment"""
    risk_level: RiskLevel
    affected_merchants_count: int
    affects_checkout: bool
    affects_revenue: bool
    reasoning: str


# ============ Action Models ============

class ProposedAction(BaseModel):
    """A proposed action to take"""
    action_type: ActionType
    draft_content: str
    target_audience: str  # "merchant", "engineering", "support"
    steps: List[str] = []


# ============ Session Models ============

class HealingSession(BaseModel):
    """A complete healing session (adapted from self-healing-framework)"""
    id: str
    status: HealingStatus = HealingStatus.OBSERVING
    started_at: datetime = Field(default_factory=datetime.now)
    completed_at: Optional[datetime] = None
    
    # Inputs
    tickets: List[SupportTicket] = []
    errors: List[ErrorLog] = []
    client_message: Optional[str] = None  # The original text from the client side
    
    # Step outputs
    observed_issues: List[Issue] = []
    clusters: List[IssueCluster] = []
    knowledge_sources: List[KnowledgeSource] = []
    historical_solutions: List[HistoricalSolution] = []
    
    # Diagnosis
    diagnosis: Optional[Diagnosis] = None
    risk_assessment: Optional[RiskAssessment] = None
    
    # Action
    proposed_action: Optional[ProposedAction] = None
    requires_human_approval: bool = False
    
    # Learning
    is_learning_candidate: bool = False
    human_feedback: Optional[str] = None
    was_correct: Optional[bool] = None
    
    # Dispatch tracking
    dispatched_at: Optional[datetime] = None


# ============ Agent Output Models ============

class AgentOutput(BaseModel):
    """Final output from the support agent (matches system prompt format)"""
    observed_pattern: str
    root_cause: str
    confidence: float
    risk: str
    recommended_action: str
    requires_human_approval: bool
    explanation: str
    learning_candidate: bool
    sources_used: List[str] = []


# ============ Approval Queue Models ============

class ApprovalRequest(BaseModel):
    """A request waiting for human approval"""
    id: str
    session_id: str
    proposed_action: ProposedAction
    diagnosis: Diagnosis
    risk_assessment: RiskAssessment
    explanation: str
    created_at: datetime = Field(default_factory=datetime.now)
    status: str = "pending"  # pending, approved, rejected
    reviewer_notes: Optional[str] = None


# ============ Pattern Recognition Models (from self-healing-framework) ============

class IssuePattern(BaseModel):
    """A recurring pattern of issues"""
    issue_type: str
    frequency: int
    avg_time_between_occurrences: float  # in hours
    common_context: Dict[str, Any] = {}
    affected_endpoints: List[str] = []
    severity: IssueSeverity
    last_occurrence: datetime
    first_occurrence: datetime


class PreventiveMeasure(BaseModel):
    """A suggested preventive measure"""
    pattern: IssuePattern
    suggested_action: str
    priority: str  # low, medium, high
    reasoning: str
    estimated_impact: str


# ============ Metrics Models ============

class HealingMetrics(BaseModel):
    """Metrics for healing system performance"""
    total_sessions: int = 0
    completed_sessions: int = 0
    failed_sessions: int = 0
    avg_resolution_time_seconds: float = 0.0
    success_rate: float = 0.0
    auto_resolved_count: int = 0
    human_escalated_count: int = 0
    learning_events_count: int = 0
