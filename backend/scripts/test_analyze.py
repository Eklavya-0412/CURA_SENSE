"""
Test just the _build_output and full analyze flow
"""
import sys
import asyncio
sys.path.insert(0, ".")

from datetime import datetime
from services.support_agent import support_agent

async def test_analyze():
    print("Testing analyze()...")
    
    result = await support_agent.analyze(
        tickets=[{
            "merchant_id": "MCH-1001",
            "subject": "Webhook not arriving",
            "description": "We configured webhooks but no events received",
            "migration_stage": "post-migration",
            "priority": "high"
        }]
    )
    
    print(f"Result: {result}")
    print(f"observed_pattern: {result.observed_pattern}")
    print(f"root_cause: {result.root_cause}")
    print(f"confidence: {result.confidence}")
    print(f"risk: {result.risk}")
    print(f"requires_human_approval: {result.requires_human_approval}")
    print(f"sources_used: {result.sources_used}")
    
    print("\n✅ Test passed!")

asyncio.run(test_analyze())
