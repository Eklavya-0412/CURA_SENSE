import React from 'react'
import ReactDOM from 'react-dom/client'
import AgentDashboard from './components/AgentDashboard.jsx'
import './index.css'

/**
 * Support Dashboard Entry Point (Port 3001)
 * 
 * Run with: npm run dev:support
 * This is the support staff application to review and approve AI responses.
 */
ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <AgentDashboard />
    </React.StrictMode>,
)
