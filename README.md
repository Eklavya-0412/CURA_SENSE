# AGENTIC_APP

## Backend setup

The backend uses Groq for chat completions. Create a Groq API key and set it in
the repository `.env` file:

```env
GROQ_API_KEY=your_groq_api_key
LLM_MODEL=openai/gpt-oss-120b
```

Install the Python dependencies with `uv sync` (or `pip install -r
requirements.txt`), then start the API with:

```powershell
uv run uvicorn backend.main:app --reload
```

The embedding model and vector store remain local and do not use the Groq key.