# CURA_SENSE / MigraGuard
 
## 🚀 Quick Start (One-Click Launcher)

You can launch both the Backend and Frontend with a single command:

- **Windows Batch (Double-click or run in terminal):**
  ```cmd
  launch.bat
  ```
- **PowerShell:**
  ```powershell
  .\launch.ps1
  ```
- **Python / UV:**
  ```powershell
  python launch.py
  ```

This will automatically:
1. Verify prerequisites & environment configuration (`.env`)
2. Start the FastAPI backend on port `8000`
3. Wait for the health check probe to pass
4. Start the React/Vite frontend on port `5173`
5. Automatically open the dashboard in your default browser

### Launcher Options

```powershell
python launch.py --help
# Or show interactive menu:
python launch.py --menu
# Run backend only:
python launch.py --backend
# Run frontend only:
python launch.py --frontend
# Ingest demo tickets:
python launch.py --demo
# Simulate checkout webhook failure:
python launch.py --test-webhook
```

---

## Manual Setup

### Backend setup

The backend uses Groq for chat completions. Copy `.env.example` to `.env` and set your Groq API key:

```env
GROQ_API_KEY=your_groq_api_key
LLM_MODEL=openai/gpt-oss-120b
```

Start the API with:

```powershell
uv run uvicorn backend.main:app --reload
```

The embedding model and vector store remain local and do not use the Groq key.

### Frontend setup

```powershell
cd frontend
npm install
npm run dev
```