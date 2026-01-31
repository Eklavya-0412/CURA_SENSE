"""
Data Ingestion Script for MigraGuard.
Loads all training data into ChromaDB collections.

Run this script to populate the knowledge base before using the agent:
    python -m scripts.ingest_data
"""

import json
import os
import sys
from pathlib import Path
from datetime import datetime

# Add backend to path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from langchain_core.documents import Document
from services.vector_store import get_vector_store
from config import BASE_DIR


def load_json_file(filepath: str) -> list:
    """Load a JSON file"""
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)


def load_markdown_files(directory: str) -> list:
    """Load all markdown files from a directory"""
    docs = []
    dir_path = Path(directory)
    
    if not dir_path.exists():
        print(f"Directory not found: {directory}")
        return docs
    
    for md_file in dir_path.glob("*.md"):
        with open(md_file, 'r', encoding='utf-8') as f:
            content = f.read()
            docs.append({
                "content": content,
                "source": md_file.name,
                "type": "documentation"
            })
    
    return docs


def ingest_support_tickets():
    """Ingest support tickets into past_incidents collection"""
    print("\n📋 Ingesting support tickets...")
    
    filepath = backend_dir / "data" / "support_tickets.json"
    
    if not filepath.exists():
        print(f"  ⚠️  File not found: {filepath}")
        return 0
    
    tickets = load_json_file(filepath)
    documents = []
    
    for ticket in tickets:
        # Create searchable document
        content = f"""
Subject: {ticket['subject']}
Description: {ticket['description']}
Category: {ticket.get('metadata', {}).get('category', 'unknown')}
Priority: {ticket['priority']}
Migration Stage: {ticket['migration_stage']}
"""
        doc = Document(
            page_content=content,
            metadata={
                "id": ticket["id"],
                "merchant_id": ticket["merchant_id"],
                "category": ticket.get("metadata", {}).get("category", "unknown"),
                "priority": ticket["priority"],
                "migration_stage": ticket["migration_stage"],
                "source": "support_ticket",
                "timestamp": ticket.get("timestamp", datetime.now().isoformat())
            }
        )
        documents.append(doc)
    
    # Add to vector store
    vector_store = get_vector_store()
    vector_store.add_documents(documents, collection_name="past_incidents")
    
    print(f"  ✅ Ingested {len(documents)} support tickets")
    return len(documents)


def ingest_error_patterns():
    """Ingest error patterns into error_patterns collection"""
    print("\n🔴 Ingesting error patterns...")
    
    filepath = backend_dir / "data" / "error_patterns.json"
    
    if not filepath.exists():
        print(f"  ⚠️  File not found: {filepath}")
        return 0
    
    patterns = load_json_file(filepath)
    documents = []
    
    for pattern in patterns:
        # Create rich searchable content
        content = f"""
Error Code: {pattern['error_code']}
Error Message: {pattern['error_message']}
Category: {pattern['category']}
Severity: {pattern['severity']}

Symptoms:
{chr(10).join('- ' + s for s in pattern.get('symptoms', []))}

Possible Causes:
{chr(10).join('- ' + c for c in pattern.get('possible_causes', []))}

Resolution Steps:
{chr(10).join(str(i+1) + '. ' + s for i, s in enumerate(pattern.get('resolution_steps', [])))}
"""
        doc = Document(
            page_content=content,
            metadata={
                "id": pattern["id"],
                "error_code": pattern["error_code"],
                "category": pattern["category"],
                "severity": pattern["severity"],
                "source": "error_pattern",
                "documentation_link": pattern.get("documentation_link", "")
            }
        )
        documents.append(doc)
    
    vector_store = get_vector_store()
    vector_store.add_documents(documents, collection_name="error_patterns")
    
    print(f"  ✅ Ingested {len(documents)} error patterns")
    return len(documents)


def ingest_past_incidents():
    """Ingest past incidents into past_incidents collection"""
    print("\n📜 Ingesting past incidents...")
    
    filepath = backend_dir / "data" / "past_incidents.json"
    
    if not filepath.exists():
        print(f"  ⚠️  File not found: {filepath}")
        return 0
    
    incidents = load_json_file(filepath)
    documents = []
    
    for incident in incidents:
        content = f"""
Title: {incident['title']}
Description: {incident['description']}
Issue Type: {incident['issue_type']}
Severity: {incident['severity']}

Root Cause: {incident['root_cause']}

Resolution: {incident['resolution']}

Resolution Steps:
{chr(10).join(str(i+1) + '. ' + s for i, s in enumerate(incident.get('resolution_steps', [])))}

Lessons Learned: {incident.get('lessons_learned', 'N/A')}
"""
        doc = Document(
            page_content=content,
            metadata={
                "id": incident["id"],
                "issue_type": incident["issue_type"],
                "severity": incident["severity"],
                "root_cause": incident["root_cause"],
                "resolution": incident["resolution"],
                "was_correct": incident.get("was_correct", True),
                "time_to_resolution_hours": incident.get("time_to_resolution_hours", 0),
                "source": "past_incident"
            }
        )
        documents.append(doc)
    
    vector_store = get_vector_store()
    vector_store.add_documents(documents, collection_name="past_incidents")
    
    print(f"  ✅ Ingested {len(documents)} past incidents")
    return len(documents)


def ingest_knowledge_base():
    """Ingest knowledge base documents"""
    print("\n📚 Ingesting knowledge base...")
    
    kb_dir = backend_dir / "data" / "knowledge_base"
    
    if not kb_dir.exists():
        print(f"  ⚠️  Directory not found: {kb_dir}")
        return 0
    
    docs = load_markdown_files(kb_dir)
    documents = []
    
    for doc in docs:
        # Split large documents into chunks
        content = doc["content"]
        chunks = chunk_text(content, max_size=1500, overlap=200)
        
        for i, chunk in enumerate(chunks):
            document = Document(
                page_content=chunk,
                metadata={
                    "source": doc["source"],
                    "type": "knowledge_base",
                    "chunk": i,
                    "total_chunks": len(chunks)
                }
            )
            documents.append(document)
    
    if documents:
        vector_store = get_vector_store()
        vector_store.add_documents(documents, collection_name="knowledge_base")
    
    print(f"  ✅ Ingested {len(documents)} knowledge base chunks from {len(docs)} files")
    return len(documents)


def chunk_text(text: str, max_size: int = 1500, overlap: int = 200) -> list:
    """Split text into overlapping chunks"""
    if len(text) <= max_size:
        return [text]
    
    chunks = []
    start = 0
    
    while start < len(text):
        end = start + max_size
        
        # Try to break at paragraph or sentence
        if end < len(text):
            # Look for paragraph break
            para_break = text.rfind('\n\n', start, end)
            if para_break > start + max_size // 2:
                end = para_break
            else:
                # Look for sentence break
                sent_break = text.rfind('. ', start, end)
                if sent_break > start + max_size // 2:
                    end = sent_break + 1
        
        chunks.append(text[start:end].strip())
        start = end - overlap
    
    return chunks


def main():
    """Main ingestion function"""
    print("=" * 60)
    print("🚀 MigraGuard Data Ingestion")
    print("=" * 60)
    
    total_docs = 0
    
    # Ingest all data sources
    total_docs += ingest_error_patterns()
    total_docs += ingest_past_incidents()
    total_docs += ingest_support_tickets()
    total_docs += ingest_knowledge_base()
    
    print("\n" + "=" * 60)
    print(f"✅ Ingestion complete! Total documents: {total_docs}")
    print("=" * 60)
    
    # Print collection summary
    vector_store = get_vector_store()
    collections = vector_store.list_collections()
    
    print("\n📊 Collection Summary:")
    for collection in collections:
        print(f"  - {collection}")
    
    return total_docs


if __name__ == "__main__":
    main()
