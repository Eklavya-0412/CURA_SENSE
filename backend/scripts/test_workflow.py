"""
Full workflow test to debug the agent API.
"""
import sys
import asyncio
sys.path.insert(0, ".")

from datetime import datetime
from models.types import (
    SupportTicket, ErrorLog, MigrationStage
)

print("Testing full workflow...")

from agents.nodes import (
    observe_node, cluster_node, search_knowledge_node,
    diagnose_node, assess_risk_node, decide_action_node,
    act_node, explain_node
)
from agents.graph import create_initial_state

# Create test ticket
ticket = SupportTicket(
    id="test-1",
    merchant_id="MCH-1001",
    subject="Webhook not arriving",
    description="We configured webhooks but no events received",
    migration_stage=MigrationStage.POST_MIGRATION,
    priority="high",
    timestamp=datetime.now()
)

async def test_workflow():
    print("\n1. Creating initial state...")
    try:
        state = create_initial_state("test-session", [ticket], [])
        print("   ✅ Initial state created")
    except Exception as e:
        print(f"   ❌ Failed: {e}")
        return
    
    print("\n2. Running observe_node...")
    try:
        state = observe_node(state)
        print(f"   ✅ observe_node - {len(state.get('observed_issues', []))} issues")
    except Exception as e:
        print(f"   ❌ observe_node failed: {e}")
        import traceback
        traceback.print_exc()
        return
    
    print("\n3. Running cluster_node...")
    try:
        state = cluster_node(state)
        print(f"   ✅ cluster_node - {len(state.get('clusters', []))} clusters")
    except Exception as e:
        print(f"   ❌ cluster_node failed: {e}")
        import traceback
        traceback.print_exc()
        return
    
    print("\n4. Running search_knowledge_node...")
    try:
        state = search_knowledge_node(state)
        print(f"   ✅ search_knowledge_node - {len(state.get('knowledge_sources', []))} sources")
    except Exception as e:
        print(f"   ❌ search_knowledge_node failed: {e}")
        import traceback
        traceback.print_exc()
        return
    
    print("\n5. Running diagnose_node...")
    try:
        state = await diagnose_node(state)
        diagnosis = state.get('diagnosis')
        print(f"   ✅ diagnose_node - root_cause: {diagnosis.root_cause if diagnosis else 'None'}")
    except Exception as e:
        print(f"   ❌ diagnose_node failed: {e}")
        import traceback
        traceback.print_exc()
        return
    
    print("\n6. Running assess_risk_node...")
    try:
        state = assess_risk_node(state)
        risk = state.get('risk_assessment')
        print(f"   ✅ assess_risk_node - risk: {risk.risk_level if risk else 'None'}")
    except Exception as e:
        print(f"   ❌ assess_risk_node failed: {e}")
        import traceback
        traceback.print_exc()
        return
    
    print("\n7. Running decide_action_node...")
    try:
        state = decide_action_node(state)
        print(f"   ✅ decide_action_node - action: {state.get('action_type')}")
    except Exception as e:
        print(f"   ❌ decide_action_node failed: {e}")
        import traceback
        traceback.print_exc()
        return
    
    print("\n8. Running act_node...")
    try:
        state = await act_node(state)
        action = state.get('proposed_action')
        print(f"   ✅ act_node - draft length: {len(action.draft_content) if action else 0}")
    except Exception as e:
        print(f"   ❌ act_node failed: {e}")
        import traceback
        traceback.print_exc()
        return
    
    print("\n9. Running explain_node...")
    try:
        state = explain_node(state)
        print(f"   ✅ explain_node - explanation length: {len(state.get('explanation', ''))}")
    except Exception as e:
        print(f"   ❌ explain_node failed: {e}")
        import traceback
        traceback.print_exc()
        return
    
    print("\n" + "="*50)
    print("All workflow steps completed successfully!")
    print("="*50)

# Run the test
asyncio.run(test_workflow())
