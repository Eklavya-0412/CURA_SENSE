
# 🛡️ CuraSense 

**Automated Self-Healing AI Agent for E-Commerce Migrations**

**CuraSense** is a full-stack "Agentic AI" platform designed to stabilize high-stakes e-commerce migrations. It acts as a digital Site Reliability Engineer (SRE) that listens to error signals in real-time, diagnoses root causes using RAG (Retrieval-Augmented Generation), and auto-generates fixes for human approval.

## 🚀 The Problem

Platform migrations (e.g., Magento to Shopify) generate thousands of repetitive support tickets, ranging from 404s to payment gateway timeouts. Support teams drown in noise, increasing Mean Time To Resolution (MTTR) and risking revenue.

## 💡 The Solution

CuraSense employs a **Self-Healing Loop**:

1. **Observe:** Ingests webhooks and error logs via a JS SDK.
2. **Cluster:** Groups similar errors to detect volume spikes or systemic failures.
3. **Reason:** Uses **Google Gemini** + **LangChain** to diagnose issues against a vector knowledge base.
4. **Decide:** Assesses risk (Revenue/Checkout impact) and determines if an auto-fix is safe.
5. **Act:** Generates precise code patches, CLI commands, or manual steps.
6. **Learn:** Updates its long-term memory (ChromaDB) after successful resolutions.

---

## ✨ Key Features

### 🧠 Agentic Backend (Python/FastAPI)

* **LangGraph Orchestration:** Manages the cyclic state machine for the AI agent (Observe -> Reason -> Act).
* **RAG Knowledge Base:** Uses **ChromaDB** to retrieve past incidents and documentation for accurate diagnosis.
* **Strict Output Formatting:** Enforces "Observe-Reason-Decide-Act" logic for transparent AI reasoning.
* **Webhook Ingestion:** Real-time listeners for `checkout-failure`, `api-failure`, and generic JS errors.

### 🖥️ Frontend Dashboard (React/Vite)

* **Glassmorphism UI:** Modern, responsive interface using **TailwindCSS** and **Framer Motion**.
* **Merchant Portal:** A dedicated view for merchants to submit issues and receive approved fixes.
* **Agent Dashboard:** A command center for support staff to view live clusters, risk heatmaps, and the approval queue.
* **Live Simulator:** A demo environment (`merchant-demo.html`) to trigger synthetic errors (e.g., 503 Service Unavailable, Checkout Timeout).

---

## 🛠️ Tech Stack

**Backend**

* **Framework:** FastAPI
* **AI Orchestration:** LangChain, LangGraph
* **LLM:** Google Gemini Pro (`gemini-pro`)
* **Vector Database:** ChromaDB
* **Language:** Python 3.9+

**Frontend**

* **Framework:** React 19 + Vite
* **Styling:** TailwindCSS 4
* **Animations:** Framer Motion, OGL (for 3D Orbs)
* **Icons:** Lucide React

---

## ⚡ Getting Started

### Prerequisites

* Python 3.9+
* Node.js 18+
* Google Gemini API Key

### 1. Backend Setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # or .venv\Scripts\activate on Windows
pip install -r requirements.txt

# Set up environment variables
export GOOGLE_API_KEY="your_gemini_api_key"
export CHROMA_PERSIST_DIR="./chroma_db"

# Run the server
uvicorn main:app --reload --port 8000

```

### 2. Frontend Setup

```bash
cd frontend
npm install

# Run the dashboards
# Merchant Portal runs on localhost:3000
# Support Dashboard runs on localhost:3001
npm run dev

```

---

## 🎮 How to Use

1. **Open the Live Monitor:**
Navigate to `http://localhost:3000/merchant-demo.html`. This page simulates a merchant store.
2. **Trigger an Error:**
Click **"Checkout Failure"** or **"API 503 Error"** to send a webhook signal to the backend.
3. **View Analysis:**
Open the **Support Dashboard** (`http://localhost:3001`). You will see the issue appear in "Live Analysis" with a risk score and root cause diagnosis.
4. **Approve the Fix:**
Go to the "Approval Queue" tab. Review the AI-generated code fix and click **Approve**.
5. **Merchant Resolution:**
Switch to the **Merchant Portal** (`http://localhost:3000`). The approved fix will appear as a popup or in the session history.

---

## 📂 Project Structure

```
CURA_SENSE/
├── backend/
│   ├── agents/          # LangGraph logic (nodes.py, graph.py)
│   ├── data/            # Knowledge base JSONs and ChromaDB
│   ├── models/          # Pydantic schemas (types.py)
│   ├── routes/          # API endpoints (webhooks.py, agent.py)
│   └── services/        # Core business logic (support_agent.py)
│
├── frontend/
│   ├── src/
│   │   ├── components/  # React components (AgentDashboard, MerchantApp)
│   │   ├── api/         # API client
│   │   └── ...
│   ├── merchant-demo.html # Error simulator
│   └── ...

```

---

## 🤝 Contributing

Contributions are welcome! Please fork the repository and submit a pull request.

## 📄 License

This project is licensed under the MIT License.

---

<p align="center">
Built with ❤️ by <a href="[https://github.com/Eklavya-0412](https://www.google.com/search?q=https://github.com/Eklavya-0412)">Eklavya-0412</a>
</p>
