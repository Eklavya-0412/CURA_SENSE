"""
LangChain Tools for the Support Agent.
These are the tools the "Healer" agent uses to interact with:
- ChromaDB (RAG knowledge base)
- Pattern matching
- Solution generation
"""

from typing import List, Optional, Dict, Any
from langchain_core.tools import tool
from langchain_core.documents import Document
from pydantic import BaseModel, Field

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.vector_store import get_vector_store
from services.embeddings import EmbeddingService


# ============ Tool Input Schemas ============

class SearchKnowledgeInput(BaseModel):
    """Input for searching the knowledge base"""
    query: str = Field(description="The search query describing the issue or topic")
    collection: str = Field(
        default="knowledge_base",
        description="Collection to search: 'knowledge_base', 'error_patterns', 'past_incidents', 'merchant_profiles'"
    )
    k: int = Field(default=5, description="Number of results to return")


class ClassifyIssueInput(BaseModel):
    """Input for classifying an issue type"""
    error_message: str = Field(description="The error message to classify")
    context: str = Field(default="", description="Additional context about the issue")


class GenerateDraftInput(BaseModel):
    """Input for generating a draft response"""
    issue_summary: str = Field(description="Summary of the issue")
    root_cause: str = Field(description="Identified root cause")
    target_audience: str = Field(
        default="merchant",
        description="Who the response is for: 'merchant', 'engineering', 'support'"
    )
    knowledge_context: str = Field(default="", description="Relevant knowledge from RAG")


class FindSimilarTicketsInput(BaseModel):
    """Input for finding similar past tickets"""
    ticket_text: str = Field(description="The ticket content to find similar tickets for")
    k: int = Field(default=5, description="Number of similar tickets to return")


# ============ Tools ============

@tool("search_knowledge_base", args_schema=SearchKnowledgeInput)
def search_knowledge_base(query: str, collection: str = "knowledge_base", k: int = 5) -> str:
    """
    Search the internal knowledge base for relevant information.
    
    Use this tool to find:
    - Migration documentation
    - Webhook & API setup guides
    - Past incidents and known issues
    - Previously resolved tickets
    
    Returns the most relevant snippets that help explain the current issue.
    """
    try:
        vector_store = get_vector_store()
        
        # Check if collection exists, if not use default
        available_collections = vector_store.list_collections()
        if collection not in available_collections:
            collection = "default"
        
        docs = vector_store.similarity_search(query, k=k, collection_name=collection)
        
        if not docs:
            return f"No relevant documents found in '{collection}' collection for query: {query}"
        
        results = []
        for i, doc in enumerate(docs, 1):
            source = doc.metadata.get("source", "unknown")
            results.append(f"[{i}] Source: {source}\n{doc.page_content[:500]}...")
        
        return "\n\n---\n\n".join(results)
    
    except Exception as e:
        return f"Error searching knowledge base: {str(e)}"


@tool("classify_issue_type")
def classify_issue_type(error_message: str, context: str = "") -> str:
    """
    Classify the type of issue based on error message and context.
    
    Returns one of:
    - webhook_failure: Issues with webhook delivery or configuration
    - api_error: API authentication, rate limiting, or endpoint issues
    - checkout_failure: Payment or checkout flow problems
    - product_sync: Product catalog or inventory sync issues
    - auth_failure: Authentication or authorization problems
    - configuration_error: General misconfiguration
    - unknown: Cannot determine issue type
    
    Also provides a confidence score.
    """
    error_lower = error_message.lower()
    context_lower = context.lower()
    combined = f"{error_lower} {context_lower}"
    
    # Simple keyword-based classification (in production, use ML model)
    classifications = {
        "webhook_failure": ["webhook", "callback", "notification", "event", "delivery"],
        "api_error": ["api", "endpoint", "rate limit", "429", "500", "502", "503"],
        "checkout_failure": ["checkout", "payment", "cart", "order", "stripe", "paypal"],
        "product_sync": ["product", "inventory", "catalog", "sync", "sku", "stock"],
        "auth_failure": ["401", "403", "unauthorized", "forbidden", "token", "auth", "oauth"],
        "configuration_error": ["config", "setting", "setup", "missing", "invalid"]
    }
    
    scores = {}
    for issue_type, keywords in classifications.items():
        score = sum(1 for kw in keywords if kw in combined)
        if score > 0:
            scores[issue_type] = score
    
    if not scores:
        return "issue_type: unknown\nconfidence: 0.1\nreasoning: No matching patterns found"
    
    best_type = max(scores, key=scores.get)
    confidence = min(0.9, scores[best_type] / 5)  # Cap at 0.9
    
    return f"issue_type: {best_type}\nconfidence: {confidence:.2f}\nreasoning: Matched {scores[best_type]} keywords for {best_type}"


@tool("generate_draft_response", args_schema=GenerateDraftInput)
def generate_draft_response(
    issue_summary: str,
    root_cause: str,
    target_audience: str = "merchant",
    knowledge_context: str = ""
) -> str:
    """
    Generate a draft response for the identified issue.
    
    This tool creates:
    - Merchant setup instructions (for merchant_misconfiguration)
    - Draft support responses (for documentation_gap)
    - Engineering escalation summaries (for platform_regression)
    
    The draft is NOT sent automatically - it requires human review.
    """
    
    templates = {
        "merchant": f"""
## Draft Merchant Response

**Issue Summary:** {issue_summary}

**Root Cause:** {root_cause}

**Recommended Steps:**

1. [Based on the issue, provide specific step 1]
2. [Provide specific step 2]
3. [Provide specific step 3]

**Additional Context from Knowledge Base:**
{knowledge_context if knowledge_context else "No additional context available."}

**Need More Help?**
If the issue persists after following these steps, please reply to this ticket with:
- Screenshots of any error messages
- The exact time the issue occurred
- Any recent changes to your configuration

---
*This is a draft response pending human review.*
""",
        "engineering": f"""
## Engineering Escalation

**Priority:** [To be assessed]

**Issue Summary:** {issue_summary}

**Identified Root Cause:** {root_cause}

**Evidence:**
{knowledge_context if knowledge_context else "See attached ticket details."}

**Affected Components:**
- [Component 1]
- [Component 2]

**Recommended Investigation:**
1. Check recent deployments affecting [component]
2. Review error logs for timeframe
3. Validate configuration in [system]

**Customer Impact:**
[To be filled based on risk assessment]

---
*This is a draft escalation pending human approval.*
""",
        "support": f"""
## Internal Support Note

**Issue:** {issue_summary}
**Root Cause:** {root_cause}

**Background:**
{knowledge_context if knowledge_context else "See knowledge base for similar issues."}

**Suggested Handling:**
1. Verify merchant's current configuration
2. Cross-reference with similar past tickets
3. Follow standard resolution procedure

---
*For internal use only.*
"""
    }
    
    return templates.get(target_audience, templates["merchant"])


@tool("check_similar_past_tickets", args_schema=FindSimilarTicketsInput)
def check_similar_past_tickets(ticket_text: str, k: int = 5) -> str:
    """
    Find similar past tickets to identify patterns and past resolutions.
    
    Use this to:
    - Check if this is a known recurring issue
    - Find how similar issues were resolved
    - Identify if multiple merchants are affected by the same problem
    
    Returns similar tickets with their resolutions if available.
    """
    try:
        vector_store = get_vector_store()
        embedding_service = EmbeddingService()
        
        # Search past incidents collection
        docs = vector_store.similarity_search(
            ticket_text,
            k=k,
            collection_name="past_incidents"
        )
        
        if not docs:
            return "No similar past tickets found. This may be a new issue type."
        
        results = []
        for i, doc in enumerate(docs, 1):
            metadata = doc.metadata
            resolution = metadata.get("resolution", "No resolution recorded")
            was_correct = metadata.get("was_correct", "Unknown")
            
            results.append(f"""
[Similar Ticket {i}]
Content: {doc.page_content[:300]}...
Resolution: {resolution}
Was Resolution Correct: {was_correct}
""")
        
        return "\n---\n".join(results)
    
    except Exception as e:
        return f"Error searching past tickets: {str(e)}"


@tool("calculate_impact_risk")
def calculate_impact_risk(
    affected_merchants_count: int,
    affects_checkout: bool,
    affects_revenue: bool,
    migration_stage: str,
    is_systemic: bool
) -> str:
    """
    Calculate the risk level of taking action on this issue.
    
    Risk is based on IMPACT if we are wrong, not correctness:
    - low: Affects one merchant, no revenue risk
    - medium: Affects few merchants or non-critical flows  
    - high: Affects many merchants, live checkout, or revenue
    
    Returns risk level with reasoning.
    """
    
    risk_factors = []
    risk_score = 0
    
    # Merchant count
    if affected_merchants_count > 10:
        risk_factors.append(f"High merchant count ({affected_merchants_count})")
        risk_score += 3
    elif affected_merchants_count > 3:
        risk_factors.append(f"Multiple merchants affected ({affected_merchants_count})")
        risk_score += 2
    elif affected_merchants_count > 1:
        risk_factors.append(f"Few merchants affected ({affected_merchants_count})")
        risk_score += 1
    
    # Checkout impact
    if affects_checkout:
        risk_factors.append("Affects checkout flow")
        risk_score += 3
    
    # Revenue impact
    if affects_revenue:
        risk_factors.append("Affects revenue")
        risk_score += 3
    
    # Migration stage
    if migration_stage == "post-migration":
        risk_factors.append("Post-migration (live environment)")
        risk_score += 2
    elif migration_stage == "mid-migration":
        risk_factors.append("Mid-migration (critical transition)")
        risk_score += 1
    
    # Systemic
    if is_systemic:
        risk_factors.append("Systemic issue pattern")
        risk_score += 2
    
    # Determine level
    if risk_score >= 5:
        risk_level = "high"
    elif risk_score >= 2:
        risk_level = "medium"
    else:
        risk_level = "low"
    
    reasoning = "; ".join(risk_factors) if risk_factors else "No significant risk factors identified"
    
    return f"""
risk_level: {risk_level}
risk_score: {risk_score}/10
factors: {reasoning}
requires_approval: {risk_level == 'high'}
"""


# ============ Tool Collection ============

def get_support_agent_tools() -> List:
    """Get all tools available to the support agent"""
    return [
        search_knowledge_base,
        classify_issue_type,
        generate_draft_response,
        check_similar_past_tickets,
        calculate_impact_risk
    ]
