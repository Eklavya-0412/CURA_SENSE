"""
FastAPI Main Application - MigraGuard Agent Backend
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import API_HOST, API_PORT
from routes import chat_router, documents_router
from routes.agent import router as agent_router
from routes.webhooks import router as webhook_router
from routes.monitor import router as monitor_router
from models.schemas import HealthResponse

# Create FastAPI app
app = FastAPI(
    title="MigraGuard Agent API",
    description="Backend API for MigraGuard - Autonomous Migration Sentinel with Self-Healing Capabilities",
    version="1.0.0"
)

# Configure CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000", "http://localhost:3001", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(chat_router)
app.include_router(documents_router)
app.include_router(agent_router)  # MigraGuard Support Agent routes
app.include_router(webhook_router)  # Automatic error ingestion webhooks
app.include_router(monitor_router)  # Live monitoring API with API key auth


@app.get("/", response_model=HealthResponse)
async def root():
    """Root endpoint - health check."""
    return HealthResponse(status="healthy", message="Agentic AI API is running")


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint."""
    return HealthResponse(status="healthy", message="All systems operational")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host=API_HOST, port=API_PORT, reload=True)
