import React from 'react'
import ReactDOM from 'react-dom/client'
import MerchantApp from './components/MerchantApp.jsx'
import './index.css'

/**
 * Merchant Portal Entry Point (Port 3000)
 * 
 * Run with: npm run dev:merchant
 * This is the client-facing application for merchants to submit issues.
 */
ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <MerchantApp />
    </React.StrictMode>,
)
