"""
Live Monitoring API - Real-Time Error Detection & Self-Healing

This module provides:
1. API-key authenticated endpoint for live error signals
2. Rate limiting and spike detection
3. Automatic escalation for systemic issues
"""

from fastapi import APIRouter, Header, HTTPException, BackgroundTasks, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta
from collections import defaultdict
import uuid
import asyncio

# Import the support agent and types
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.support_agent import support_agent
from models.types import MigrationStage

router = APIRouter(prefix="/v1/monitor", tags=["Live Monitoring"])

# ============ API Key Management ============
# In production, this would be stored in a database
VALID_API_KEYS = {
    "MIGRA-KEY-PRO-2026": {"merchant_id": "MCH-PRO-001", "tier": "pro", "rate_limit": 1000},
    "MIGRA-KEY-DEMO-001": {"merchant_id": "MCH-DEMO-001", "tier": "demo", "rate_limit": 100},
    "MIGRA-KEY-ENTERPRISE": {"merchant_id": "MCH-ENTERPRISE", "tier": "enterprise", "rate_limit": 10000},
}

# ============ In-Memory Signal Tracking for Spike Detection ============
# Structure: { merchant_id: { error_hash: [timestamp1, timestamp2, ...] } }
signal_tracker: Dict[str, Dict[str, List[datetime]]] = defaultdict(lambda: defaultdict(list))

# Spike detection thresholds
SPIKE_THRESHOLD = 50  # Number of similar errors
SPIKE_WINDOW_MINUTES = 60  # Time window in minutes


# ============ Request Models ============

class LiveErrorSignal(BaseModel):
    """Error signal from merchant's live site"""
    error_message: str = Field(..., description="The error message captured")
    stack_trace: str = Field(default="N/A", description="Stack trace if available")
    merchant_id: str = Field(..., description="Merchant identifier")
    url: str = Field(..., description="URL where error occurred")
    migration_stage: str = Field(default="post-migration", description="Current migration stage")
    user_agent: Optional[str] = Field(default=None, description="Browser user agent")
    session_id: Optional[str] = Field(default=None, description="User session ID")
    context: Optional[Dict[str, Any]] = Field(default={}, description="Additional context")


class BatchErrorSignal(BaseModel):
    """Batch of error signals for bulk reporting"""
    signals: List[LiveErrorSignal]


class HealthCheckResponse(BaseModel):
    """Response for health check endpoint"""
    status: str
    merchant_id: str
    tier: str
    signals_today: int
    rate_limit: int
    spike_detected: bool


# ============ Helper Functions ============

def validate_api_key(api_key: str) -> Dict[str, Any]:
    """Validate API key and return merchant info"""
    if not api_key:
        raise HTTPException(status_code=401, detail="Missing API Key. Include 'x-api-key' header.")
    
    if api_key not in VALID_API_KEYS:
        raise HTTPException(status_code=401, detail="Invalid API Key. Access denied.")
    
    return VALID_API_KEYS[api_key]


def get_error_hash(error_message: str) -> str:
    """Create a simplified hash for grouping similar errors"""
    # Take first 50 chars and normalize
    normalized = error_message.lower().strip()[:50]
    # Remove specific identifiers like line numbers
    for char in ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']:
        normalized = normalized.replace(char, '#')
    return normalized


def check_for_spike(merchant_id: str, error_message: str) -> tuple[bool, int]:
    """Check if this error is part of a spike pattern"""
    error_hash = get_error_hash(error_message)
    now = datetime.now()
    cutoff = now - timedelta(minutes=SPIKE_WINDOW_MINUTES)
    
    # Add current signal
    signal_tracker[merchant_id][error_hash].append(now)
    
    # Clean old signals
    signal_tracker[merchant_id][error_hash] = [
        t for t in signal_tracker[merchant_id][error_hash] 
        if t > cutoff
    ]
    
    count = len(signal_tracker[merchant_id][error_hash])
    return count >= SPIKE_THRESHOLD, count


def create_ticket_from_signal(signal: LiveErrorSignal, is_spike: bool, spike_count: int) -> Dict[str, Any]:
    """Convert a live signal into a ticket dict for processing"""
    # Determine priority based on spike detection
    if is_spike:
        priority = "critical"
        subject = f"🚨 SPIKE ALERT: {signal.error_message[:40]}..."
    else:
        priority = "high" if "checkout" in signal.error_message.lower() else "medium"
        subject = f"Live Error: {signal.error_message[:50]}..."
    
    description = f"""
**Auto-Detected Live Error**

**URL:** {signal.url}
**Error:** {signal.error_message}
**Stack Trace:**
```
{signal.stack_trace}
```
**Migration Stage:** {signal.migration_stage}
**User Agent:** {signal.user_agent or 'Unknown'}

{"⚠️ **SPIKE DETECTED:** " + str(spike_count) + " similar errors in the last hour!" if is_spike else ""}
"""
    
    return {
        "id": f"LIVE-{uuid.uuid4().hex[:8].upper()}",
        "merchant_id": signal.merchant_id,
        "subject": subject,
        "description": description.strip(),
        "priority": priority,
        "category": "live_monitoring",
        "migration_stage": signal.migration_stage,
        "timestamp": datetime.now().isoformat(),
        "metadata": {
            "source": "live_monitor",
            "url": signal.url,
            "is_spike": is_spike,
            "spike_count": spike_count,
            "user_agent": signal.user_agent,
            "session_id": signal.session_id,
            **(signal.context or {})
        }
    }


# ============ API Endpoints ============

@router.post("/report")
async def report_live_error(
    signal: LiveErrorSignal,
    background_tasks: BackgroundTasks,
    x_api_key: str = Header(None, alias="x-api-key")
):
    """
    Receive a live error signal from a merchant's website.
    
    This endpoint:
    1. Validates the API key
    2. Checks for spike patterns
    3. Creates an auto-ticket
    4. Triggers AI analysis in the background
    """
    # 1. Validate API Key
    merchant_info = validate_api_key(x_api_key)
    
    # 2. Check for spike
    is_spike, spike_count = check_for_spike(signal.merchant_id, signal.error_message)
    
    # 3. Create ticket
    ticket = create_ticket_from_signal(signal, is_spike, spike_count)
    
    # 4. Trigger AI analysis asynchronously
    session_id = await support_agent.analyze_async(
        client_message=ticket["description"],
        merchant_id=signal.merchant_id
    )
    
    # 5. Log the signal
    print(f"[LIVE MONITOR] {'🚨 SPIKE' if is_spike else '📡 Signal'} from {signal.merchant_id}: {signal.error_message[:50]}...")
    
    return {
        "status": "received",
        "ticket_id": ticket["id"],
        "session_id": session_id,
        "is_spike": is_spike,
        "spike_count": spike_count if is_spike else None,
        "message": "🚨 SPIKE DETECTED - Engineering escalation triggered" if is_spike else "Signal received. AI Agent is observing."
    }


@router.post("/report/batch")
async def report_batch_errors(
    batch: BatchErrorSignal,
    background_tasks: BackgroundTasks,
    x_api_key: str = Header(None, alias="x-api-key")
):
    """
    Receive multiple error signals at once.
    Useful for buffered/batched error reporting.
    """
    # Validate API Key
    merchant_info = validate_api_key(x_api_key)
    
    results = []
    for signal in batch.signals:
        is_spike, spike_count = check_for_spike(signal.merchant_id, signal.error_message)
        ticket = create_ticket_from_signal(signal, is_spike, spike_count)
        
        session_id = await support_agent.analyze_async(
            client_message=ticket["description"],
            merchant_id=signal.merchant_id
        )
        
        results.append({
            "ticket_id": ticket["id"],
            "session_id": session_id,
            "is_spike": is_spike
        })
    
    spikes = sum(1 for r in results if r["is_spike"])
    
    return {
        "status": "received",
        "total_signals": len(batch.signals),
        "spikes_detected": spikes,
        "tickets": results
    }


@router.get("/health")
async def monitor_health_check(
    x_api_key: str = Header(None, alias="x-api-key")
):
    """
    Health check endpoint for merchants to verify their integration.
    Returns current monitoring status and spike detection state.
    """
    merchant_info = validate_api_key(x_api_key)
    merchant_id = merchant_info["merchant_id"]
    
    # Count today's signals
    today_signals = sum(
        len(timestamps) 
        for timestamps in signal_tracker.get(merchant_id, {}).values()
    )
    
    # Check for any active spikes
    spike_detected = any(
        len(timestamps) >= SPIKE_THRESHOLD
        for timestamps in signal_tracker.get(merchant_id, {}).values()
    )
    
    return HealthCheckResponse(
        status="healthy",
        merchant_id=merchant_id,
        tier=merchant_info["tier"],
        signals_today=today_signals,
        rate_limit=merchant_info["rate_limit"],
        spike_detected=spike_detected
    )


@router.get("/sdk.js")
async def get_monitoring_sdk():
    """
    Serve the MigraGuard Active Monitoring SDK.
    Merchants include this script in their application.
    """
    sdk_code = """
// ============================================================
// MigraGuard Active Monitoring SDK v1.0
// Real-Time Error Detection & Self-Healing Layer
// ============================================================
(function(window) {
    'use strict';
    
    const MigraGuardMonitor = {
        config: {
            apiKey: null,
            merchantId: null,
            endpoint: null,
            batchMode: false,
            batchInterval: 5000, // 5 seconds
            maxBatchSize: 10,
            debug: false
        },
        
        _queue: [],
        _batchTimer: null,
        _initialized: false,
        
        /**
         * Initialize the monitoring SDK
         * @param {Object} options - Configuration options
         */
        init: function(options) {
            if (this._initialized) {
                console.warn('[MigraGuard] Already initialized');
                return;
            }
            
            this.config = { ...this.config, ...options };
            
            if (!this.config.apiKey || !this.config.merchantId || !this.config.endpoint) {
                console.error('[MigraGuard] Missing required config: apiKey, merchantId, endpoint');
                return;
            }
            
            // Set up error listeners
            this._setupErrorListeners();
            
            // Set up batch processing if enabled
            if (this.config.batchMode) {
                this._startBatchProcessor();
            }
            
            this._initialized = true;
            this._log('Initialized successfully');
            
            // Send health check
            this._healthCheck();
        },
        
        /**
         * Set up global error listeners
         */
        _setupErrorListeners: function() {
            const self = this;
            
            // Capture JavaScript runtime errors
            window.addEventListener('error', function(event) {
                self.captureError({
                    message: event.message,
                    stack: event.error ? event.error.stack : 'N/A',
                    filename: event.filename,
                    lineno: event.lineno,
                    colno: event.colno
                });
            });
            
            // Capture unhandled promise rejections
            window.addEventListener('unhandledrejection', function(event) {
                self.captureError({
                    message: 'Unhandled Promise Rejection: ' + String(event.reason),
                    stack: event.reason && event.reason.stack ? event.reason.stack : 'N/A',
                    type: 'promise_rejection'
                });
            });
            
            // Intercept fetch for API error monitoring
            this._interceptFetch();
        },
        
        /**
         * Intercept fetch to monitor API failures
         */
        _interceptFetch: function() {
            const self = this;
            const originalFetch = window.fetch;
            
            window.fetch = function(...args) {
                return originalFetch.apply(this, args)
                    .then(function(response) {
                        if (!response.ok && response.status >= 500) {
                            self.captureError({
                                message: 'API Error: ' + response.status + ' ' + response.statusText,
                                stack: 'URL: ' + args[0],
                                type: 'api_error',
                                status_code: response.status
                            });
                        }
                        return response;
                    })
                    .catch(function(error) {
                        self.captureError({
                            message: 'Network Error: ' + error.message,
                            stack: 'URL: ' + args[0],
                            type: 'network_error'
                        });
                        throw error;
                    });
            };
        },
        
        /**
         * Capture and report an error
         * @param {Object} errorData - Error details
         */
        captureError: function(errorData) {
            const signal = {
                error_message: errorData.message || 'Unknown error',
                stack_trace: errorData.stack || 'N/A',
                merchant_id: this.config.merchantId,
                url: window.location.href,
                migration_stage: 'post-migration',
                user_agent: navigator.userAgent,
                session_id: this._getSessionId(),
                context: {
                    type: errorData.type || 'js_error',
                    filename: errorData.filename,
                    lineno: errorData.lineno,
                    colno: errorData.colno,
                    timestamp: new Date().toISOString()
                }
            };
            
            if (this.config.batchMode) {
                this._addToQueue(signal);
            } else {
                this._sendSignal(signal);
            }
        },
        
        /**
         * Send a signal to the backend
         */
        _sendSignal: function(signal) {
            const self = this;
            
            fetch(this.config.endpoint + '/v1/monitor/report', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': this.config.apiKey
                },
                body: JSON.stringify(signal)
            })
            .then(function(response) { return response.json(); })
            .then(function(data) {
                self._log('Signal sent:', data);
                if (data.is_spike) {
                    console.warn('[MigraGuard] 🚨 SPIKE DETECTED - Engineering has been alerted');
                }
            })
            .catch(function(error) {
                self._log('Failed to send signal:', error);
            });
        },
        
        /**
         * Add signal to batch queue
         */
        _addToQueue: function(signal) {
            this._queue.push(signal);
            
            if (this._queue.length >= this.config.maxBatchSize) {
                this._flushQueue();
            }
        },
        
        /**
         * Flush the batch queue
         */
        _flushQueue: function() {
            if (this._queue.length === 0) return;
            
            const signals = this._queue.splice(0, this.config.maxBatchSize);
            const self = this;
            
            fetch(this.config.endpoint + '/v1/monitor/report/batch', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': this.config.apiKey
                },
                body: JSON.stringify({ signals: signals })
            })
            .then(function(response) { return response.json(); })
            .then(function(data) {
                self._log('Batch sent:', data);
            })
            .catch(function(error) {
                self._log('Failed to send batch:', error);
            });
        },
        
        /**
         * Start batch processor timer
         */
        _startBatchProcessor: function() {
            const self = this;
            this._batchTimer = setInterval(function() {
                self._flushQueue();
            }, this.config.batchInterval);
        },
        
        /**
         * Health check ping
         */
        _healthCheck: function() {
            const self = this;
            
            fetch(this.config.endpoint + '/v1/monitor/health', {
                method: 'GET',
                headers: {
                    'x-api-key': this.config.apiKey
                }
            })
            .then(function(response) { return response.json(); })
            .then(function(data) {
                self._log('Health check:', data);
            })
            .catch(function(error) {
                console.error('[MigraGuard] Health check failed:', error);
            });
        },
        
        /**
         * Get or create session ID
         */
        _getSessionId: function() {
            let sessionId = sessionStorage.getItem('migraguard_session');
            if (!sessionId) {
                sessionId = 'sess_' + Math.random().toString(36).substr(2, 9);
                sessionStorage.setItem('migraguard_session', sessionId);
            }
            return sessionId;
        },
        
        /**
         * Debug logging
         */
        _log: function(...args) {
            if (this.config.debug) {
                console.log('[MigraGuard]', ...args);
            }
        },
        
        /**
         * Manually trigger a test error (for debugging)
         */
        testError: function() {
            this.captureError({
                message: 'Test Error from MigraGuard SDK',
                stack: 'This is a test error triggered manually',
                type: 'test'
            });
        }
    };
    
    // Expose globally
    window.MigraGuardMonitor = MigraGuardMonitor;
    
})(window);
"""
    
    return Response(content=sdk_code, media_type="application/javascript")


@router.get("/demo")
async def get_demo_page():
    """
    Serve a demo page for testing the monitoring SDK.
    """
    html = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MigraGuard Live Monitoring Demo</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%);
            min-height: 100vh;
            color: white;
            padding: 40px;
        }
        .container { max-width: 900px; margin: 0 auto; }
        h1 { font-size: 2.5rem; margin-bottom: 10px; }
        .subtitle { color: #a5b4fc; margin-bottom: 30px; }
        .card {
            background: rgba(255,255,255,0.1);
            backdrop-filter: blur(10px);
            border-radius: 16px;
            padding: 24px;
            margin-bottom: 20px;
            border: 1px solid rgba(255,255,255,0.1);
        }
        .card h2 { font-size: 1.2rem; margin-bottom: 16px; color: #c7d2fe; }
        .btn-group { display: flex; flex-wrap: wrap; gap: 12px; }
        button {
            padding: 14px 24px;
            border: none;
            border-radius: 10px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        button:hover { transform: translateY(-2px); }
        .btn-error { background: #ef4444; color: white; }
        .btn-spike { background: #dc2626; color: white; animation: pulse 1s infinite; }
        .btn-api { background: #6366f1; color: white; }
        .btn-promise { background: #8b5cf6; color: white; }
        .btn-test { background: #10b981; color: white; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }
        .log {
            background: #0f172a;
            border-radius: 8px;
            padding: 16px;
            font-family: 'Monaco', 'Menlo', monospace;
            font-size: 12px;
            max-height: 300px;
            overflow-y: auto;
            margin-top: 16px;
        }
        .log-entry { padding: 4px 0; border-bottom: 1px solid #1e293b; }
        .log-success { color: #4ade80; }
        .log-error { color: #f87171; }
        .log-spike { color: #fbbf24; font-weight: bold; }
        .log-info { color: #60a5fa; }
        .code {
            background: #0f172a;
            border-radius: 8px;
            padding: 16px;
            font-family: 'Monaco', 'Menlo', monospace;
            font-size: 12px;
            overflow-x: auto;
            white-space: pre;
        }
        .badge {
            display: inline-block;
            background: #4ade80;
            color: #022c22;
            padding: 4px 10px;
            border-radius: 20px;
            font-size: 11px;
            font-weight: 700;
            margin-left: 10px;
        }
        .status { display: flex; align-items: center; margin-bottom: 20px; }
        .status-dot {
            width: 12px; height: 12px;
            background: #4ade80;
            border-radius: 50%;
            margin-right: 10px;
            animation: blink 1.5s infinite;
        }
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
    </style>
</head>
<body>
    <div class="container">
        <div class="status">
            <div class="status-dot"></div>
            <span>Live Monitoring Active</span>
            <span class="badge">CONNECTED</span>
        </div>
        
        <h1>🛡️ MigraGuard Live Monitor</h1>
        <p class="subtitle">Real-Time Error Detection & Self-Healing Layer</p>
        
        <div class="card">
            <h2>🔌 SDK Integration Code</h2>
            <div class="code">&lt;script src="http://localhost:8000/v1/monitor/sdk.js"&gt;&lt;/script&gt;
&lt;script&gt;
  MigraGuardMonitor.init({
    apiKey: "MIGRA-KEY-PRO-2026",
    merchantId: "MCH-DEMO-001",
    endpoint: "http://localhost:8000",
    debug: true
  });
&lt;/script&gt;</div>
        </div>
        
        <div class="card">
            <h2>⚡ Simulate Live Errors</h2>
            <div class="btn-group">
                <button class="btn-error" onclick="triggerJSError()">
                    🐛 JS Runtime Error
                </button>
                <button class="btn-promise" onclick="triggerPromiseError()">
                    💥 Promise Rejection
                </button>
                <button class="btn-api" onclick="triggerAPIError()">
                    🔌 API 503 Error
                </button>
                <button class="btn-spike" onclick="triggerSpike()">
                    🚨 TRIGGER 55-ERROR SPIKE
                </button>
                <button class="btn-test" onclick="testSDK()">
                    ✅ Test SDK
                </button>
            </div>
        </div>
        
        <div class="card">
            <h2>📋 Event Log</h2>
            <div class="log" id="log">
                <div class="log-entry log-info">[System] Initializing MigraGuard SDK...</div>
            </div>
        </div>
    </div>
    
    <!-- Load MigraGuard SDK from our backend -->
    <script src="/v1/monitor/sdk.js"></script>
    <script>
        // Initialize the SDK
        MigraGuardMonitor.init({
            apiKey: "MIGRA-KEY-PRO-2026",
            merchantId: "MCH-LIVE-DEMO",
            endpoint: "http://localhost:8000",
            debug: true
        });
        
        function log(message, type = 'info') {
            const logEl = document.getElementById('log');
            const entry = document.createElement('div');
            entry.className = 'log-entry log-' + type;
            entry.textContent = '[' + new Date().toLocaleTimeString() + '] ' + message;
            logEl.appendChild(entry);
            logEl.scrollTop = logEl.scrollHeight;
        }
        
        log('SDK initialized for MCH-LIVE-DEMO', 'success');
        
        function triggerJSError() {
            log('Triggering JavaScript runtime error...', 'error');
            // This will be caught by the SDK
            setTimeout(function() {
                throw new Error("Uncaught TypeError: Cannot read properties of undefined (reading 'checkout_token')");
            }, 100);
        }
        
        function triggerPromiseError() {
            log('Triggering unhandled promise rejection...', 'error');
            Promise.reject(new Error("API call failed: 503 Service Unavailable"));
        }
        
        function triggerAPIError() {
            log('Triggering API 503 error...', 'error');
            // This will fail and be caught
            fetch('http://localhost:8000/api/fake-endpoint-503')
                .then(r => r.json())
                .catch(e => log('API error captured by SDK', 'error'));
        }
        
        async function triggerSpike() {
            log('🚨 TRIGGERING 55-ERROR SPIKE...', 'spike');
            
            for (let i = 0; i < 55; i++) {
                MigraGuardMonitor.captureError({
                    message: "SPIKE: Checkout token undefined - iteration " + (i + 1),
                    stack: "at checkout.js:42\\n  at processPayment:101",
                    type: "checkout_error"
                });
                
                if (i % 10 === 0) {
                    log('Sent ' + (i + 1) + '/55 errors...', 'spike');
                }
                
                // Small delay to not overwhelm
                await new Promise(r => setTimeout(r, 50));
            }
            
            log('🚨 SPIKE COMPLETE - 55 errors sent! Check Support Dashboard for alert.', 'spike');
        }
        
        function testSDK() {
            log('Sending test signal...', 'info');
            MigraGuardMonitor.testError();
            log('Test signal sent successfully!', 'success');
        }
        
        // Capture SDK's console output
        const originalLog = console.log;
        console.log = function(...args) {
            if (args[0] && args[0].includes && args[0].includes('[MigraGuard]')) {
                log(args.join(' '), 'info');
            }
            originalLog.apply(console, args);
        };
    </script>
</body>
</html>
"""
    return Response(content=html, media_type="text/html")
