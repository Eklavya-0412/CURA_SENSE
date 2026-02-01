# MigraGuard AI Agent Architecture

This document outlines the **LangGraph** workflow that powers the MigraGuard Self-Healing Agent.

## 🧠 LangGraph Workflow (10-Step Process)

The agent follows a cyclic graph architecture defined in `backend/agents/graph.py` and executed by `backend/services/support_agent.py`.

```mermaid
graph TD
    %% Nodes
    START((Start)) --> OBSERVE
    
    subgraph "Perception & Analysis"
        OBSERVE[Observe Node<br/>(Parse Tickets & Logs)]
        CLUSTER[Cluster Node<br/>(Detect Spikes & Patterns)]
        SEARCH[Search Node<br/>(RAG Knowledge Retrieval)]
    end
    
    subgraph "Reasoning Core"
        REASON[Reason Node<br/>(Diagnose Root Cause)]
        RISK[Risk Assessment<br/>(Impact Analysis)]
        DECIDE[Decide Action<br/>(Auto-Fix vs. Approval)]
    end
    
    subgraph "Execution & Learning"
        ACT[Act Node<br/>(Generate Fix Code/JSON)]
        EXPLAIN[Explain Node<br/>(Generate Reasoning)]
        LEARN[Learn Node<br/>(Update Knowledge Base)]
    end
    
    %% Edges / Logic flow
    OBSERVE --> CLUSTER
    CLUSTER --> SEARCH
    SEARCH --> REASON
    REASON --> RISK
    RISK --> DECIDE
    
    %% Decision Logic
    DECIDE -- "Auto-Fix Eligible\n(Low Risk & High Conf)" --> ACT
    DECIDE -- "Requires Approval\n(High Risk or Low Conf)" --> HUMAN_APPROVAL
    
    subgraph "Human-in-the-Loop"
        HUMAN_APPROVAL{Human Approval}
        QUEUE[Approval Queue]
    end
    
    HUMAN_APPROVAL -- "Push to Queue" --> QUEUE
    QUEUE -.->|API: approve_action| ACT
    QUEUE -.->|API: reject_action| END((End / Fail))
    
    ACT --> EXPLAIN
    EXPLAIN --> LEARN
    LEARN --> END
    
    %% Styling
    classDef perception fill:#e0f2fe,stroke:#0284c7,stroke-width:2px;
    classDef reasoning fill:#f0fdf4,stroke:#16a34a,stroke-width:2px;
    classDef execution fill:#f5f3ff,stroke:#7c3aed,stroke-width:2px;
    classDef human fill:#fff7ed,stroke:#ea580c,stroke-width:2px,stroke-dasharray: 5 5;
    
    class OBSERVE,CLUSTER,SEARCH perception;
    class REASON,RISK,DECIDE reasoning;
    class ACT,EXPLAIN,LEARN execution;
    class HUMAN_APPROVAL,QUEUE human;
```

## 🔍 State Management

The agent maintains a shared state object `SupportAgentState` throughout the lifecycle:

| Field | Type | Description |
|-------|------|-------------|
| `tickets` | List[Ticket] | Raw input tickets |
| `clusters` | List[Cluster] | Grouped issues (e.g., "50 users facing API 503") |
| `diagnosis` | Object | Root cause (e.g., `merchant_misconfiguration`) & Confidence |
| `risk_assessment` | Object | Risk Level (Low/Medium/High/Critical) |
| `action_type` | Enum | The decided action (e.g., `ESCALATE`, `AUTO_FIX`) |
| `proposed_action` | JSON | The generated fix content (Code, CLI, or Steps) |
| `status` | string | Current step (e.g., `analyzing`, `awaiting_approval`) |

## 🛡️ Safety Guardrails

1.  **Volume Spike Detection**: If >50 similar tickets detected -> **Force Engineering Escalation**.
2.  **Abnormal Pattern Detection**: If `Post-Migration` + `API Failure` -> **Force Urgent Review**.
3.  **Auto-Fix Gates**: Only allowed if:
    *   Risk is **LOW**
    *   Confidence is **> 85%**
    *   Does NOT affect **Checkout** or **Revenue**
