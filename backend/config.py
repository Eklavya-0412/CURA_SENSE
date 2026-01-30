"""
Configuration module for the Agentic AI Backend.
Loads environment variables and provides configuration settings.
"""
import os
from pathlib import Path
from dotenv import load_dotenv

# Base directory (parent of backend)
BASE_DIR = Path(__file__).resolve().parent.parent

# Load environment variables from .env file (in parent directory)
load_dotenv(BASE_DIR / ".env")

# LLM Configuration
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")

# Vector DB Configuration
CHROMA_PERSIST_DIR = os.getenv("CHROMA_PERSIST_DIR", str(BASE_DIR / "chroma_db"))
VECTOR_DB_TYPE = os.getenv("VECTOR_DB_TYPE", "chroma")

# API Configuration
API_HOST = os.getenv("API_HOST", "0.0.0.0")
API_PORT = int(os.getenv("API_PORT", "8000"))

# Embedding Model
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")

# LLM Model
LLM_MODEL = os.getenv("LLM_MODEL", "gemini-2.5-flash")
