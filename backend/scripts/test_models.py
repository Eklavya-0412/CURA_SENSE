"""
Simple test script to debug the agent API.
"""
import sys
sys.path.insert(0, ".")

from datetime import datetime
from models.types import (
    SupportTicket, ErrorLog, Issue, IssueCluster,
    KnowledgeSource, HistoricalSolution,
    Diagnosis, RiskAssessment, ProposedAction,
    HealingStatus, RootCause, RiskLevel, ActionType,
    IssueSeverity, MigrationStage
)

print("Testing model creation...")

# Test SupportTicket
try:
    ticket = SupportTicket(
        id="test-1",
        merchant_id="MCH-1001",
        subject="Test subject",
        description="Test description",
        migration_stage=MigrationStage.POST_MIGRATION,
        priority="high",
        timestamp=datetime.now()
    )
    print("✅ SupportTicket created successfully")
except Exception as e:
    print(f"❌ SupportTicket failed: {e}")

# Test Issue
try:
    issue = Issue(
        id="issue-1",
        type="ticket",
        error_message="Test error",
        severity=IssueSeverity.HIGH,
        migration_stage=MigrationStage.POST_MIGRATION,
        merchant_id="MCH-1001",
        detected_at=datetime.now()
    )
    print("✅ Issue created successfully")
except Exception as e:
    print(f"❌ Issue failed: {e}")

# Test IssueCluster
try:
    cluster = IssueCluster(
        cluster_id="cluster-1",
        issues=[issue],
        representative_text="Test text",
        migration_stages=["post-migration"],
        affected_merchants=["MCH-1001"],
        is_systemic=False,
        similarity_score=0.8
    )
    print("✅ IssueCluster created successfully")
except Exception as e:
    print(f"❌ IssueCluster failed: {e}")

# Test KnowledgeSource
try:
    ks = KnowledgeSource(
        content="Test content",
        source_type="migration_docs",
        metadata={"key": "value"},
        relevance_score=0.8
    )
    print("✅ KnowledgeSource created successfully")
except Exception as e:
    print(f"❌ KnowledgeSource failed: {e}")

# Test HistoricalSolution
try:
    hs = HistoricalSolution(
        id="hs-1",
        issue_type="test_type",
        issue_message="Test message",
        solution_description="Test solution",
        resolution_steps=["Step 1", "Step 2"],
        success_rate=0.8,
        application_count=5,
        relevance_score=0.7
    )
    print("✅ HistoricalSolution created successfully")
except Exception as e:
    print(f"❌ HistoricalSolution failed: {e}")

# Test Diagnosis
try:
    diagnosis = Diagnosis(
        root_cause=RootCause.MERCHANT_MISCONFIGURATION,
        confidence=0.85,
        reasoning="Test reasoning",
        supporting_evidence=["Evidence 1"]
    )
    print("✅ Diagnosis created successfully")
except Exception as e:
    print(f"❌ Diagnosis failed: {e}")

# Test RiskAssessment
try:
    risk = RiskAssessment(
        risk_level=RiskLevel.HIGH,
        affected_merchants_count=5,
        affects_checkout=True,
        affects_revenue=True,
        reasoning="Test risk reasoning"
    )
    print("✅ RiskAssessment created successfully")
except Exception as e:
    print(f"❌ RiskAssessment failed: {e}")

# Test ProposedAction
try:
    action = ProposedAction(
        action_type=ActionType.DRAFT_SUPPORT_RESPONSE,
        draft_content="Test draft",
        target_audience="merchant",
        steps=["Step 1"]
    )
    print("✅ ProposedAction created successfully")
except Exception as e:
    print(f"❌ ProposedAction failed: {e}")

print("\nAll basic model tests completed!")
print("\nNow testing observe_node...")

from agents.nodes import observe_node
from agents.graph import create_initial_state

try:
    state = create_initial_state("test-session", [ticket], [])
    print("✅ Initial state created")
    
    result = observe_node(state)
    print(f"✅ observe_node executed, issues: {len(result.get('observed_issues', []))}")
except Exception as e:
    print(f"❌ observe_node failed: {e}")
    import traceback
    traceback.print_exc()

print("\nDone!")
