"""
LangGraph Node Functions for the Support Agent Workflow.
Each node implements one step of the 10-step system prompt.
"""

import uuid
from typing import Dict, Any, List
from datetime import datetime
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser, JsonOutputParser

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import GOOGLE_API_KEY, LLM_MODEL
from services.vector_store import get_vector_store
from services.embeddings import EmbeddingService
from models.types import (
    Issue, IssueCluster, KnowledgeSource, HistoricalSolution,
    Diagnosis, RiskAssessment, ProposedAction,
    HealingStatus, RootCause, RiskLevel, ActionType,
    IssueSeverity, MigrationStage
)


# ============ LLM Setup ============

def get_llm():
    """Get the configured LLM"""
    return ChatGoogleGenerativeAI(
        model=LLM_MODEL,
        google_api_key=GOOGLE_API_KEY,
        temperature=0.3,  # Lower for more consistent outputs
        convert_system_message_to_human=True
    )


# ============ STEP 1: OBSERVE ============

def observe_node(state: Dict[str, Any]) -> Dict[str, Any]:
    """
    STEP 1 — OBSERVE
    
    Parse tickets and errors into normalized Issue format.
    Identify whether multiple tickets/errors are similar in meaning.
    """
    observed_issues = []
    
    # Process tickets
    for ticket in state.get("tickets", []):
        issue = Issue(
            id=f"issue_{ticket.id}",
            type="ticket",
            error_message=f"{ticket.subject}: {ticket.description}",
            severity=_map_priority_to_severity(ticket.priority),
            migration_stage=ticket.migration_stage,
            merchant_id=ticket.merchant_id,
            detected_at=ticket.timestamp,
            context={
                "source": "ticket",
                "subject": ticket.subject,
                "metadata": ticket.metadata
            }
        )
        observed_issues.append(issue)
    
    # Process errors
    for error in state.get("errors", []):
        issue = Issue(
            id=f"issue_{error.id}",
            type="error",
            error_message=error.error_message,
            stack_trace=error.stack_trace,
            severity=IssueSeverity.MEDIUM,
            migration_stage=error.migration_stage,
            merchant_id=error.merchant_id,
            detected_at=error.timestamp,
            context={
                "source": "error_log",
                "error_code": error.error_code,
                "endpoint": error.endpoint,
                **error.context
            }
        )
        observed_issues.append(issue)
    
    return {
        **state,
        "observed_issues": observed_issues,
        "status": HealingStatus.CLUSTERING
    }


def _map_priority_to_severity(priority: str) -> IssueSeverity:
    """Map ticket priority to issue severity"""
    mapping = {
        "critical": IssueSeverity.CRITICAL,
        "high": IssueSeverity.HIGH,
        "medium": IssueSeverity.MEDIUM,
        "low": IssueSeverity.LOW
    }
    return mapping.get(priority.lower(), IssueSeverity.MEDIUM)


# ============ STEP 2: CLUSTER & PATTERN CHECK ============

def cluster_node(state: Dict[str, Any]) -> Dict[str, Any]:
    """
    STEP 2 — CLUSTER & ABNORMAL PATTERN DETECTION
    
    Detects:
    - Systemic issues (multiple merchants affected)
    - Volume spikes (50+ tickets for same issue)
    - Abnormal patterns (post-migration + API/webhook failures)
    
    If spike detected, flags for immediate engineering escalation.
    """
    issues = state.get("observed_issues", [])
    tickets = state.get("tickets", [])
    
    if not issues:
        return {
            **state, 
            "clusters": [],
            "is_systemic": False,
            "volume_spike": False,
            "abnormal_pattern": False,
            "status": HealingStatus.SEARCHING
        }
    
    # ========== 1. Detect Volume Spikes (50+ tickets for one problem) ==========
    issue_counts = {}
    for issue in issues:
        # Group by first part of error message (simplified clustering)
        msg_key = issue.error_message.split(":")[0].strip().lower()[:50]
        issue_counts[msg_key] = issue_counts.get(msg_key, 0) + 1
    
    # Check if ANY problem has spiked beyond threshold
    SPIKE_THRESHOLD = 50
    volume_spike = any(count >= SPIKE_THRESHOLD for count in issue_counts.values())
    spike_count = max(issue_counts.values()) if issue_counts else 0
    
    # ========== 2. Detect Abnormal Patterns ==========
    # Pattern: Post-migration + API/Webhook failures = Abnormal
    abnormal_keywords = ["webhook", "api", "timeout", "503", "502", "gateway", "connection refused"]
    all_text = " ".join([i.error_message.lower() for i in issues])
    has_critical_errors = any(kw in all_text for kw in abnormal_keywords)
    
    # Check for post-migration stage
    is_post_migration = any(
        i.migration_stage == MigrationStage.POST_MIGRATION 
        for i in issues
    )
    
    abnormal_pattern = is_post_migration and has_critical_errors
    
    # ========== 3. Identify Affected Merchants & Stages ==========
    merchants = list(set(i.merchant_id for i in issues if i.merchant_id))
    stages = list(set(i.migration_stage.value for i in issues))
    
    # ========== 4. Helper for cluster names ==========
    def get_cluster_name(issue):
        subject = issue.context.get("subject", "")
        category = issue.context.get("category", "")
        metadata = issue.context.get("metadata", {})
        
        if subject:
            return subject
        elif category:
            return f"{category.title()} Issue"
        elif metadata and metadata.get("category"):
            return f"{metadata.get('category').title()} Issue"
        else:
            return issue.error_message[:50] if issue.error_message else "General Migration Issue"
    
    # ========== 5. Create Clusters ==========
    if len(issues) <= 1:
        # Single issue
        cluster_name = get_cluster_name(issues[0]) if issues else "No Issues"
        
        cluster = IssueCluster(
            cluster_id=str(uuid.uuid4()),
            issues=issues,
            representative_text=cluster_name,
            migration_stages=stages,
            affected_merchants=merchants,
            is_systemic=False,
            similarity_score=1.0
        )
        
        return {
            **state,
            "clusters": [cluster],
            "is_systemic": False,
            "volume_spike": False,
            "abnormal_pattern": abnormal_pattern,
            "status": HealingStatus.SEARCHING
        }
    
    # Get embeddings for semantic clustering
    embedding_service = EmbeddingService()
    texts = [i.error_message for i in issues]
    embeddings = embedding_service.embed_documents(texts)
    
    # Simple clustering by cosine similarity
    clusters = []
    used_indices = set()
    
    for i, (issue, emb1) in enumerate(zip(issues, embeddings)):
        if i in used_indices:
            continue
        
        cluster_issues = [issue]
        used_indices.add(i)
        
        for j, (other_issue, emb2) in enumerate(zip(issues, embeddings)):
            if j in used_indices:
                continue
            
            # Cosine similarity
            similarity = sum(a * b for a, b in zip(emb1, emb2))
            if similarity > 0.7:  # Threshold for similarity
                cluster_issues.append(other_issue)
                used_indices.add(j)
        
        # Create cluster with descriptive name
        cluster_merchants = list(set(i.merchant_id for i in cluster_issues if i.merchant_id))
        cluster_stages = list(set(i.migration_stage.value for i in cluster_issues))
        
        cluster_name = get_cluster_name(cluster_issues[0])
        if len(cluster_issues) > 1:
            category = cluster_issues[0].context.get("category", "issues")
            if category == "issues":
                category = cluster_issues[0].context.get("metadata", {}).get("category", "issues")
            cluster_name = f"{category.title()} ({len(cluster_issues)} tickets)"
        
        # A cluster is systemic if: volume spike OR multiple merchants OR many tickets
        cluster_is_systemic = (
            volume_spike or 
            len(cluster_merchants) > 1 or 
            len(cluster_issues) > 2
        )
        
        cluster = IssueCluster(
            cluster_id=str(uuid.uuid4()),
            issues=cluster_issues,
            representative_text=cluster_name,
            migration_stages=cluster_stages,
            affected_merchants=cluster_merchants,
            is_systemic=cluster_is_systemic,
            similarity_score=0.9 if volume_spike else 0.7
        )
        clusters.append(cluster)
    
    # Final systemic check
    is_systemic = any(c.is_systemic for c in clusters) or volume_spike or len(merchants) > 1
    
    return {
        **state,
        "clusters": clusters,
        "is_systemic": is_systemic,
        "volume_spike": volume_spike,
        "spike_count": spike_count,
        "abnormal_pattern": abnormal_pattern,
        "status": HealingStatus.SEARCHING
    }


# ============ STEP 3: SEARCH YOUR KNOWLEDGE ============

def search_knowledge_node(state: Dict[str, Any]) -> Dict[str, Any]:
    """
    STEP 3 — SEARCH YOUR KNOWLEDGE
    
    Search internal knowledge sources:
    - Migration documentation
    - Webhook & API setup guides
    - Past incidents and known issues
    - Previously resolved tickets
    """
    clusters = state.get("clusters", [])
    
    if not clusters:
        return {
            **state,
            "knowledge_sources": [],
            "historical_solutions": [],
            "status": HealingStatus.DIAGNOSING
        }
    
    # Get main cluster's representative text for search
    main_cluster = max(clusters, key=lambda c: len(c.issues))
    query = main_cluster.representative_text
    
    vector_store = get_vector_store()
    knowledge_sources = []
    historical_solutions = []
    
    # Search each collection
    collections_to_search = [
        ("knowledge_base", "migration_docs"),
        ("error_patterns", "error_patterns"),
        ("past_incidents", "past_incidents")
    ]
    
    for collection_name, source_type in collections_to_search:
        try:
            docs = vector_store.similarity_search(query, k=3, collection_name=collection_name)
            for doc in docs:
                ks = KnowledgeSource(
                    content=str(doc.page_content) if doc.page_content else "",
                    source_type=str(source_type),
                    metadata=dict(doc.metadata) if doc.metadata else {},
                    relevance_score=0.8  # Placeholder - would use actual score
                )
                knowledge_sources.append(ks)
                
                # If from past_incidents, also create historical solution
                if source_type == "past_incidents":
                    hs = HistoricalSolution(
                        id=str(doc.metadata.get("id", str(uuid.uuid4()))),
                        issue_type=str(doc.metadata.get("issue_type", "unknown")),
                        issue_message=str(doc.page_content[:200]),
                        solution_description=str(doc.metadata.get("resolution", "")),
                        resolution_steps=[],
                        success_rate=float(doc.metadata.get("success_rate", 0.7)),
                        application_count=int(doc.metadata.get("application_count", 1)),
                        relevance_score=0.8
                    )
                    historical_solutions.append(hs)
        except Exception:
            # Collection might not exist yet
            pass
    
    return {
        **state,
        "knowledge_sources": knowledge_sources,
        "historical_solutions": historical_solutions,
        "status": HealingStatus.DIAGNOSING
    }


# ============ STEP 4: REASON (DIAGNOSIS) ============

async def diagnose_node(state: Dict[str, Any]) -> Dict[str, Any]:
    """
    STEP 4 — REASON (DIAGNOSIS)
    
    Based on observed patterns and retrieved knowledge, decide:
    - Root cause (ONE of: merchant_misconfiguration, documentation_gap, platform_regression, unknown)
    - Confidence score (0-1)
    """
    clusters = state.get("clusters", [])
    knowledge_sources = state.get("knowledge_sources", [])
    is_systemic = state.get("is_systemic", False)
    
    if not clusters:
        return {
            **state,
            "diagnosis": Diagnosis(
                root_cause=RootCause.UNKNOWN,
                confidence=0.1,
                reasoning="No issues to diagnose"
            ),
            "status": HealingStatus.ASSESSING
        }
    
    main_cluster = max(clusters, key=lambda c: len(c.issues))
    
    # Build context for LLM
    issues_text = "\n".join([i.error_message for i in main_cluster.issues[:5]])
    knowledge_text = "\n".join([ks.content[:300] for ks in knowledge_sources[:3]])
    
    prompt = ChatPromptTemplate.from_template("""
You are an AI support agent diagnosing an e-commerce migration issue.

OBSERVED ISSUES:
{issues}

MIGRATION STAGES AFFECTED: {stages}
IS SYSTEMIC (multiple merchants/similar issues): {is_systemic}

RELEVANT KNOWLEDGE:
{knowledge}

Based on this, determine:
1. ROOT CAUSE - Choose exactly ONE:
   - merchant_misconfiguration (merchant did something wrong)
   - documentation_gap (our docs are unclear/missing)
   - platform_regression (our platform has a bug)
   - unknown (not enough information)

2. CONFIDENCE - A number between 0.0 and 1.0:
   - 0.9+ = Very confident, clear match to known pattern
   - 0.7-0.9 = Fairly confident, good evidence
   - 0.5-0.7 = Uncertain, multiple possibilities
   - <0.5 = Guessing, need more info

3. REASONING - Brief explanation of your diagnosis

Respond in this exact JSON format:
{{"root_cause": "...", "confidence": 0.xx, "reasoning": "..."}}
""")
    
    llm = get_llm()
    chain = prompt | llm | StrOutputParser()
    
    try:
        response = await chain.ainvoke({
            "issues": issues_text,
            "stages": ", ".join(main_cluster.migration_stages),
            "is_systemic": str(is_systemic),
            "knowledge": knowledge_text if knowledge_text else "No relevant knowledge found"
        })
        
        # Parse JSON response
        import json
        # Clean up response (remove markdown if present)
        response = response.strip()
        if response.startswith("```"):
            response = response.split("```")[1]
            if response.startswith("json"):
                response = response[4:]
        response = response.strip()
        
        result = json.loads(response)
        
        diagnosis = Diagnosis(
            root_cause=RootCause(result.get("root_cause", "unknown")),
            confidence=float(result.get("confidence", 0.5)),
            reasoning=result.get("reasoning", ""),
            supporting_evidence=[ks.content[:100] for ks in knowledge_sources[:2]]
        )
    except Exception as e:
        diagnosis = Diagnosis(
            root_cause=RootCause.UNKNOWN,
            confidence=0.3,
            reasoning=f"Error during diagnosis: {str(e)}"
        )
    
    return {
        **state,
        "diagnosis": diagnosis,
        "status": HealingStatus.ASSESSING
    }


# ============ STEP 5: RISK ASSESSMENT ============

def assess_risk_node(state: Dict[str, Any]) -> Dict[str, Any]:
    """
    STEP 5 — RISK ASSESSMENT
    
    Independently assess risk based on IMPACT if wrong:
    - low: affects one merchant, no revenue risk
    - medium: affects few merchants or non-critical flows
    - high: affects many merchants, live checkout, or revenue
    """
    clusters = state.get("clusters", [])
    
    if not clusters:
        return {
            **state,
            "risk_assessment": RiskAssessment(
                risk_level=RiskLevel.LOW,
                affected_merchants_count=0,
                affects_checkout=False,
                affects_revenue=False,
                reasoning="No issues to assess"
            ),
            "status": HealingStatus.DECIDING
        }
    
    main_cluster = max(clusters, key=lambda c: len(c.issues))
    
    # Count affected merchants
    merchants = set()
    for cluster in clusters:
        merchants.update(cluster.affected_merchants)
    merchant_count = len(merchants)
    
    # Check for checkout/revenue keywords
    checkout_keywords = ["checkout", "payment", "cart", "order", "transaction", "stripe", "paypal"]
    revenue_keywords = ["revenue", "sales", "money", "billing", "subscription"]
    
    all_text = " ".join([i.error_message.lower() for c in clusters for i in c.issues])
    
    affects_checkout = any(kw in all_text for kw in checkout_keywords)
    affects_revenue = any(kw in all_text for kw in revenue_keywords)
    
    # Check migration stage
    post_migration = any("post" in c.migration_stages for c in clusters for stage in c.migration_stages)
    
    # Determine risk level
    reasons = []
    risk_score = 0
    
    if merchant_count > 5:
        reasons.append(f"Many merchants affected ({merchant_count})")
        risk_score += 3
    elif merchant_count > 1:
        reasons.append(f"Multiple merchants affected ({merchant_count})")
        risk_score += 1
    
    if affects_checkout:
        reasons.append("Affects checkout flow")
        risk_score += 3
    
    if affects_revenue:
        reasons.append("Affects revenue")
        risk_score += 3
    
    if state.get("is_systemic"):
        reasons.append("Systemic issue pattern")
        risk_score += 2
    
    if post_migration:
        reasons.append("Post-migration (live environment)")
        risk_score += 1
    
    if risk_score >= 4:
        risk_level = RiskLevel.HIGH
    elif risk_score >= 2:
        risk_level = RiskLevel.MEDIUM
    else:
        risk_level = RiskLevel.LOW
    
    risk_assessment = RiskAssessment(
        risk_level=risk_level,
        affected_merchants_count=merchant_count,
        affects_checkout=affects_checkout,
        affects_revenue=affects_revenue,
        reasoning="; ".join(reasons) if reasons else "No significant risk factors"
    )
    
    return {
        **state,
        "risk_assessment": risk_assessment,
        "status": HealingStatus.DECIDING
    }


# ============ STEP 6: DECIDE ACTION ============

def decide_action_node(state: Dict[str, Any]) -> Dict[str, Any]:
    """
    STEP 6 — DECIDE ACTION (Auto-Fix vs Human Approval)
    
    Decision Rules:
    1. VOLUME SPIKE (50+): Immediate Engineering Escalation (requires approval)
    2. ABNORMAL PATTERN: Flag for urgent review
    3. AUTO-FIX eligible: Low risk + High confidence + No checkout impact
    4. DEFAULT: Human approval required
    
    Choose ONE recommended action:
    - Provide merchant setup instructions (can auto-fix)
    - Draft a support response (needs approval)
    - Draft an escalation to engineering (always needs approval)
    - Request human review due to uncertainty (always needs approval)
    """
    diagnosis = state.get("diagnosis")
    risk_assessment = state.get("risk_assessment")
    volume_spike = state.get("volume_spike", False)
    abnormal_pattern = state.get("abnormal_pattern", False)
    spike_count = state.get("spike_count", 0)
    
    if not diagnosis or not risk_assessment:
        return {
            **state,
            "action_type": ActionType.REQUEST_HUMAN_REVIEW,
            "requires_human_approval": True,
            "status": HealingStatus.AWAITING_APPROVAL
        }
    
    # ========== RULE 1: Volume Spike (50+) → Engineering Escalation ==========
    if volume_spike:
        return {
            **state,
            "action_type": ActionType.ESCALATE_TO_ENGINEERING,
            "requires_human_approval": True,  # Still requires approval for Eng escalation
            "explanation": f"🚨 CRITICAL: Detected high-volume spike ({spike_count}+ tickets). Auto-escalating to Engineering.",
            "status": HealingStatus.AWAITING_APPROVAL,
            "is_emergency": True
        }
    
    # ========== RULE 2: Abnormal Pattern → Urgent Review ==========
    if abnormal_pattern:
        return {
            **state,
            "action_type": ActionType.ESCALATE_TO_ENGINEERING,
            "requires_human_approval": True,
            "explanation": "⚠️ ABNORMAL PATTERN: Post-migration API/Webhook failures detected. Requires urgent engineering review.",
            "status": HealingStatus.AWAITING_APPROVAL,
            "is_emergency": True
        }
    
    # ========== RULE 3: Auto-Fix Eligibility ==========
    # Low Risk + High Confidence + No Checkout Impact = Can Auto-Fix
    is_autofix_eligible = (
        risk_assessment.risk_level == RiskLevel.LOW and
        diagnosis.confidence >= 0.85 and
        not risk_assessment.affects_checkout and
        not risk_assessment.affects_revenue
    )
    
    if is_autofix_eligible:
        # Determine auto-fix action based on root cause
        root_cause = diagnosis.root_cause
        
        if root_cause == RootCause.MERCHANT_MISCONFIGURATION:
            action_type = ActionType.PROVIDE_SETUP_INSTRUCTIONS
        elif root_cause == RootCause.DOCUMENTATION_GAP:
            action_type = ActionType.DRAFT_SUPPORT_RESPONSE
        else:
            action_type = ActionType.DRAFT_SUPPORT_RESPONSE
        
        return {
            **state,
            "action_type": action_type,
            "requires_human_approval": False,  # TRUE AUTO-FIX: No human needed
            "explanation": f"✅ AUTO-FIX ELIGIBLE: Low risk, {diagnosis.confidence:.0%} confidence, no checkout/revenue impact.",
            "status": HealingStatus.ACTING,
            "is_autofix": True
        }
    
    # ========== RULE 4: Default - Human Approval Required ==========
    # Choose action based on root cause, but require approval
    root_cause = diagnosis.root_cause
    
    if root_cause == RootCause.MERCHANT_MISCONFIGURATION:
        action_type = ActionType.PROVIDE_SETUP_INSTRUCTIONS
    elif root_cause == RootCause.DOCUMENTATION_GAP:
        action_type = ActionType.DRAFT_SUPPORT_RESPONSE
    elif root_cause == RootCause.PLATFORM_REGRESSION:
        action_type = ActionType.ESCALATE_TO_ENGINEERING
    else:
        action_type = ActionType.REQUEST_HUMAN_REVIEW
    
    # Determine why approval is needed
    approval_reasons = []
    if risk_assessment.risk_level == RiskLevel.HIGH:
        approval_reasons.append("High risk")
    if diagnosis.confidence < 0.85:
        approval_reasons.append(f"Low confidence ({diagnosis.confidence:.0%})")
    if risk_assessment.affects_checkout:
        approval_reasons.append("Affects checkout")
    if risk_assessment.affects_revenue:
        approval_reasons.append("Affects revenue")
    
    return {
        **state,
        "action_type": action_type,
        "requires_human_approval": True,
        "approval_reason": "; ".join(approval_reasons) if approval_reasons else "Standard review required",
        "status": HealingStatus.AWAITING_APPROVAL,
        "is_autofix": False
    }


# ============ STEP 7: ACT (DRAFT ONLY) ============

async def act_node(state: Dict[str, Any]) -> Dict[str, Any]:
    # 1. ADD THE GUARD: Check if we are allowed to act
    # If the session requires approval and hasn't received it, exit early.
    if state.get("requires_human_approval") and state.get("approval_status") != "approved":
        return state

    action_type = state.get("action_type")
    diagnosis = state.get("diagnosis")
    clusters = state.get("clusters", [])
    knowledge_sources = state.get("knowledge_sources", [])
    
    # Validation check
    if not action_type or not diagnosis:
        return {
            **state,
            "proposed_action": ProposedAction(
                action_type=ActionType.REQUEST_HUMAN_REVIEW,
                draft_content="Unable to generate action - missing diagnosis.",
                target_audience="support",
                steps=[]
            ),
            "status": HealingStatus.ACTING
        }
    
    # 2. Extract context for the prompt
    if clusters:
        main_cluster = max(clusters, key=lambda c: len(c.issues))
        issue_summary = main_cluster.representative_text[:500]
    else:
        issue_summary = "No specific issue identified"
    
    knowledge_context = "\n".join([ks.content[:200] for ks in knowledge_sources[:2]])
    
    # 3. Select Template based on Action Type
    llm = get_llm()
    if action_type == ActionType.PROVIDE_SETUP_INSTRUCTIONS:
        prompt = ChatPromptTemplate.from_template("""
            Generate step-by-step setup instructions for a merchant to fix this issue:
            Issue: {issue}
            Root Cause: {root_cause}
            Relevant Documentation: {knowledge}
            Provide clear, numbered steps. Be specific and actionable.
        """)
        target = "merchant"
    elif action_type == ActionType.ESCALATE_TO_ENGINEERING:
        prompt = ChatPromptTemplate.from_template("""
            Draft an engineering escalation for this platform issue:
            Issue: {issue}
            Root Cause: {root_cause}
            Evidence: {knowledge}
            Include: Summary, Impact, Recommended Investigation Steps
        """)
        target = "engineering"
    else:
        prompt = ChatPromptTemplate.from_template("""
            Draft a support response for this issue:
            Issue: {issue}
            Root Cause: {root_cause}
            Reference: {knowledge}
            Be helpful, acknowledge the issue, and provide next steps.
        """)
        target = "support"
    
    # 4. Generate the draft
    chain = prompt | llm | StrOutputParser()
    try:
        draft = await chain.ainvoke({
            "issue": issue_summary,
            "root_cause": diagnosis.root_cause.value,
            "knowledge": knowledge_context if knowledge_context else "No additional context."
        })
    except Exception as e:
        draft = f"Error generating draft: {str(e)}"
    
    # 5. Return updated state
    proposed_action = ProposedAction(
        action_type=action_type,
        draft_content=draft,
        target_audience=target,
        steps=[]
    )
    
    return {
        **state,
        "proposed_action": proposed_action,
        "status": HealingStatus.ACTING # Now this status is only set when acting actually occurs
    }


# ============ STEP 8: EXPLAIN YOURSELF ============

def explain_node(state: Dict[str, Any]) -> Dict[str, Any]:
    """
    STEP 8 — EXPLAIN YOURSELF (MANDATORY)
    
    Clearly explain:
    - What patterns you observed
    - What knowledge you used
    - Why you believe this is the root cause
    - Why you chose this action
    - Where uncertainty exists
    """
    clusters = state.get("clusters", [])
    knowledge_sources = state.get("knowledge_sources", [])
    diagnosis = state.get("diagnosis")
    risk_assessment = state.get("risk_assessment")
    action_type = state.get("action_type")
    
    # Build explanation
    explanation_parts = []
    
    # What patterns observed
    if clusters:
        main_cluster = max(clusters, key=lambda c: len(c.issues))
        explanation_parts.append(f"""
## Patterns Observed
- Total issues analyzed: {sum(len(c.issues) for c in clusters)}
- Clusters identified: {len(clusters)}
- Is systemic issue: {state.get('is_systemic', False)}
- Affected merchants: {', '.join(main_cluster.affected_merchants) if main_cluster.affected_merchants else 'Unknown'}
- Migration stages: {', '.join(main_cluster.migration_stages)}
""")
    
    # What knowledge used
    if knowledge_sources:
        sources = list(set(ks.source_type for ks in knowledge_sources))
        explanation_parts.append(f"""
## Knowledge Used
- Sources consulted: {', '.join(sources)}
- Relevant documents found: {len(knowledge_sources)}
""")
    
    # Why this root cause
    if diagnosis:
        explanation_parts.append(f"""
## Root Cause Diagnosis
- Identified cause: {diagnosis.root_cause.value}
- Confidence: {diagnosis.confidence:.0%}
- Reasoning: {diagnosis.reasoning}
""")
    
    # Risk assessment
    if risk_assessment:
        explanation_parts.append(f"""
## Risk Assessment
- Risk level: {risk_assessment.risk_level.value}
- Affects checkout: {risk_assessment.affects_checkout}
- Affects revenue: {risk_assessment.affects_revenue}
- Reasoning: {risk_assessment.reasoning}
""")
    
    # Why this action
    if action_type:
        requires_approval = state.get("requires_human_approval", False)
        explanation_parts.append(f"""
## Chosen Action
- Action type: {action_type.value}
- Requires human approval: {requires_approval}
- Reason for approval requirement: {"Risk is high or confidence < 85%" if requires_approval else "Low risk and high confidence"}
""")
    
    # Uncertainty
    if diagnosis and diagnosis.confidence < 0.85:
        explanation_parts.append(f"""
## Uncertainty Notice
Confidence is below 85% ({diagnosis.confidence:.0%}). This indicates:
- Multiple possible causes may exist
- Additional information might be needed
- Human review is recommended before action
""")
    
    explanation = "\n".join(explanation_parts)
    
    # Determine if this should be a learning candidate
    is_learning = diagnosis and diagnosis.confidence < 0.7

    # Determine if this should be a waiting candidate
    is_waiting = state.get("requires_human_approval") and state.get("approval_status") != "approved"
    final_status = HealingStatus.AWAITING_APPROVAL if is_waiting else HealingStatus.COMPLETED
    return {
        **state,
        "explanation": explanation,
        "is_learning_candidate": is_learning,
        "status": final_status
    }


# ============ STEP 9: HUMAN-IN-THE-LOOP ============

def wait_for_approval_node(state: Dict[str, Any]) -> Dict[str, Any]:
    """
    STEP 9 — HUMAN-IN-THE-LOOP
    
    If human approval is required:
    - Pause execution
    - Clearly ask for approval or rejection
    - Wait for explicit confirmation
    
    This node sets the state to awaiting and returns.
    The actual approval comes from the API endpoint.
    """
    # This node just ensures state is correct for waiting
    # Actual approval updates state via API
    
    return {
        **state,
        "status": HealingStatus.AWAITING_APPROVAL,
        "approval_status": state.get("approval_status", "pending")
    }


# ============ STEP 10: LEARN (MEMORY UPDATE) ============

async def learn_node(state: Dict[str, Any]) -> Dict[str, Any]:
    """
    STEP 10 — LEARN (MEMORY UPDATE)
    
    After resolution:
    - Check if issue already exists in memory
    - If new or meaningfully different, store:
      - Error description
      - Confirmed root cause
      - Final resolution
    
    Never overwrite - only append verified learnings.
    """
    if not state.get("is_learning_candidate", False):
        return state
    
    diagnosis = state.get("diagnosis")
    proposed_action = state.get("proposed_action")
    clusters = state.get("clusters", [])
    
    if not diagnosis or not proposed_action:
        return state
    
    # Prepare learning document
    main_cluster = clusters[0] if clusters else None
    issue_text = main_cluster.representative_text if main_cluster else "Unknown issue"
    
    from langchain_core.documents import Document
    
    learning_doc = Document(
        page_content=f"Issue: {issue_text}\nResolution: {proposed_action.draft_content[:500]}",
        metadata={
            "id": str(uuid.uuid4()),
            "issue_type": diagnosis.root_cause.value,
            "resolution": proposed_action.draft_content[:500],
            "confidence": diagnosis.confidence,
            "was_correct": state.get("approval_status") == "approved",
            "learned_at": datetime.now().isoformat(),
            "source": "learning"
        }
    )
    
    # Store in past_incidents collection
    try:
        vector_store = get_vector_store()
        vector_store.add_documents([learning_doc], collection_name="past_incidents")
    except Exception as e:
        print(f"Failed to store learning: {e}")
    
    return {
        **state,
        "status": HealingStatus.COMPLETED
    }
