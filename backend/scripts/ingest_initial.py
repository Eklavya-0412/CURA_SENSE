"""
Ingest Initial Tickets Script
Automatically loads tickets from data/support_tickets.json and triggers analysis.

Run this script to pre-populate the dashboard with tickets for the hackathon demo.

Usage:
    python scripts/ingest_initial.py

This will:
1. Load all tickets from data/support_tickets.json
2. Submit each ticket to the agent for analysis
3. Populate the dashboard with active sessions
"""

import asyncio
import json
import sys
import os
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

import httpx

API_BASE_URL = os.environ.get("API_URL", "http://localhost:8000")
DATA_FILE = Path(__file__).parent.parent / "data" / "support_tickets.json"


async def load_tickets():
    """Load tickets from JSON file."""
    if not DATA_FILE.exists():
        print(f"❌ Data file not found: {DATA_FILE}")
        return []
    
    with open(DATA_FILE, "r") as f:
        tickets = json.load(f)
    
    print(f"📋 Loaded {len(tickets)} tickets from {DATA_FILE.name}")
    return tickets


async def submit_ticket(client: httpx.AsyncClient, ticket: dict):
    """Submit a single ticket for analysis."""
    try:
        response = await client.post(
            f"{API_BASE_URL}/agent/analyze",
            json={
                "tickets": [ticket],
                "errors": []
            },
            timeout=60.0
        )
        
        if response.status_code == 200:
            result = response.json()
            return {
                "ticket_id": ticket["id"],
                "status": "success",
                "root_cause": result.get("root_cause", "unknown"),
                "risk": result.get("risk", "low"),
                "requires_approval": result.get("requires_human_approval", False)
            }
        else:
            return {
                "ticket_id": ticket["id"],
                "status": "error",
                "message": response.text
            }
    except Exception as e:
        return {
            "ticket_id": ticket["id"],
            "status": "error",
            "message": str(e)
        }


async def ingest_all_tickets(batch_size: int = 5, limit: int = None):
    """
    Ingest all tickets from the JSON file.
    
    Args:
        batch_size: Number of concurrent requests
        limit: Maximum tickets to process (None for all)
    """
    tickets = await load_tickets()
    
    if not tickets:
        return
    
    if limit:
        tickets = tickets[:limit]
        print(f"🔄 Processing first {limit} tickets...")
    else:
        print(f"🔄 Processing all {len(tickets)} tickets...")
    
    results = {
        "success": 0,
        "error": 0,
        "high_risk": 0,
        "needs_approval": 0
    }
    
    async with httpx.AsyncClient() as client:
        # Process in batches to avoid overwhelming the server
        for i in range(0, len(tickets), batch_size):
            batch = tickets[i:i + batch_size]
            print(f"\n📦 Processing batch {i // batch_size + 1} ({len(batch)} tickets)...")
            
            tasks = [submit_ticket(client, ticket) for ticket in batch]
            batch_results = await asyncio.gather(*tasks)
            
            for result in batch_results:
                if result["status"] == "success":
                    results["success"] += 1
                    icon = "✅"
                    
                    if result.get("risk") == "high":
                        results["high_risk"] += 1
                        icon = "🔴"
                    
                    if result.get("requires_approval"):
                        results["needs_approval"] += 1
                        icon = "⏳"
                    
                    print(f"  {icon} {result['ticket_id']}: {result['root_cause']} ({result['risk']} risk)")
                else:
                    results["error"] += 1
                    print(f"  ❌ {result['ticket_id']}: {result.get('message', 'Unknown error')}")
            
            # Small delay between batches
            if i + batch_size < len(tickets):
                await asyncio.sleep(1)
    
    # Summary
    print("\n" + "=" * 50)
    print("📊 INGESTION COMPLETE")
    print("=" * 50)
    print(f"✅ Successful:      {results['success']}")
    print(f"❌ Errors:          {results['error']}")
    print(f"🔴 High Risk:       {results['high_risk']}")
    print(f"⏳ Needs Approval:  {results['needs_approval']}")
    print("=" * 50)
    
    if results['needs_approval'] > 0:
        print(f"\n💡 Go to the Support Dashboard (Port 3001) to review the approval queue!")


async def ingest_single_ticket(ticket_id: str):
    """Ingest a single ticket by ID."""
    tickets = await load_tickets()
    ticket = next((t for t in tickets if t["id"] == ticket_id), None)
    
    if not ticket:
        print(f"❌ Ticket not found: {ticket_id}")
        return
    
    print(f"📋 Submitting ticket: {ticket_id}")
    
    async with httpx.AsyncClient() as client:
        result = await submit_ticket(client, ticket)
        
        if result["status"] == "success":
            print(f"✅ Success! Root cause: {result['root_cause']}, Risk: {result['risk']}")
            if result.get("requires_approval"):
                print("⏳ This ticket requires human approval. Check the dashboard!")
        else:
            print(f"❌ Error: {result.get('message', 'Unknown error')}")


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Ingest support tickets for analysis")
    parser.add_argument("--limit", "-l", type=int, default=10, 
                        help="Maximum number of tickets to process (default: 10, use 0 for all)")
    parser.add_argument("--batch-size", "-b", type=int, default=3,
                        help="Concurrent requests per batch (default: 3)")
    parser.add_argument("--ticket", "-t", type=str, default=None,
                        help="Ingest a single ticket by ID")
    
    args = parser.parse_args()
    
    print("🚀 MigraGuard Ticket Ingestion Script")
    print(f"📡 API: {API_BASE_URL}")
    print("")
    
    if args.ticket:
        asyncio.run(ingest_single_ticket(args.ticket))
    else:
        limit = None if args.limit == 0 else args.limit
        asyncio.run(ingest_all_tickets(batch_size=args.batch_size, limit=limit))
