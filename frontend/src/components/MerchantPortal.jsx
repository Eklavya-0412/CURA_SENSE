import React, { useState, useEffect } from 'react';
import { Send, MessageSquare, CheckCircle, Clock, AlertCircle, Sparkles } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/**
 * MerchantPortal - Client-side interface for merchants to submit support issues
 * This is a simplified UI for users facing problems during migration.
 * The merchant submits their issue, which is analyzed by AI and reviewed by support
 * before a response is dispatched back.
 */
export default function MerchantPortal() {
    const [message, setMessage] = useState("");
    const [merchantId, setMerchantId] = useState("MCH-" + Math.random().toString(36).substring(2, 8).toUpperCase());
    const [status, setStatus] = useState("idle"); // idle, sending, waiting, resolved, error
    const [reply, setReply] = useState("");
    const [sessionId, setSessionId] = useState(null);
    const [error, setError] = useState(null);
    const [sessionStatus, setSessionStatus] = useState(null);

    // Handle form submission
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!message.trim()) return;

        setStatus("sending");
        setError(null);

        try {
            const response = await fetch(`${API_BASE_URL}/agent/submit`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: message.trim(),
                    merchant_id: merchantId
                })
            });

            if (!response.ok) {
                throw new Error('Failed to submit issue');
            }

            const data = await response.json();
            setSessionId(data.session_id);
            setStatus("waiting");
        } catch (err) {
            setError(err.message);
            setStatus("error");
        }
    };

    // Polling loop - Poll every 3 seconds for server approval
    useEffect(() => {
        if (status === "waiting" && sessionId) {
            const pollInterval = setInterval(async () => {
                try {
                    const response = await fetch(`${API_BASE_URL}/agent/client/poll/${sessionId}`);
                    if (!response.ok) {
                        throw new Error('Failed to check status');
                    }

                    const data = await response.json();
                    setSessionStatus(data.session_status);

                    if (data.status === "resolved") {
                        setReply(data.response);
                        setStatus("resolved");
                        clearInterval(pollInterval);
                    }
                } catch (err) {
                    console.error('Polling error:', err);
                }
            }, 3000);

            return () => clearInterval(pollInterval);
        }
    }, [status, sessionId]);

    // Reset to submit a new issue
    const handleReset = () => {
        setMessage("");
        setStatus("idle");
        setReply("");
        setSessionId(null);
        setError(null);
        setSessionStatus(null);
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-6">
            {/* Floating background elements */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-pulse"></div>
                <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-indigo-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
                <div className="absolute top-1/2 right-1/3 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }}></div>
            </div>

            <div className="relative w-full max-w-2xl">
                {/* Glass card container */}
                <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl shadow-2xl overflow-hidden">
                    {/* Header */}
                    <div className="bg-gradient-to-r from-indigo-600/80 to-purple-600/80 px-8 py-6 border-b border-white/10">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-white/20 rounded-xl">
                                <MessageSquare className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold text-white">Merchant Help Desk</h1>
                                <p className="text-indigo-200 text-sm">
                                    Migration Support Portal
                                </p>
                            </div>
                        </div>
                        {merchantId && (
                            <div className="mt-4 inline-flex items-center gap-2 bg-white/10 px-3 py-1 rounded-full">
                                <span className="text-xs text-indigo-200">Merchant ID:</span>
                                <span className="text-xs font-mono text-white">{merchantId}</span>
                            </div>
                        )}
                    </div>

                    {/* Content area */}
                    <div className="p-8">
                        {/* IDLE: Show submission form */}
                        {status === "idle" && (
                            <form onSubmit={handleSubmit} className="space-y-6">
                                <div>
                                    <label className="block text-sm font-medium text-indigo-200 mb-2">
                                        Describe your issue
                                    </label>
                                    <textarea
                                        className="w-full bg-white/5 border border-white/20 text-white placeholder-white/40 
                                                   p-4 rounded-xl resize-none focus:outline-none focus:ring-2 
                                                   focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all
                                                   min-h-[150px]"
                                        value={message}
                                        onChange={(e) => setMessage(e.target.value)}
                                        placeholder="Example: My checkout is failing after the migration. I'm getting error code API_401 when trying to process payments..."
                                    />
                                </div>

                                <button
                                    type="submit"
                                    disabled={!message.trim()}
                                    className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 
                                               hover:to-purple-500 disabled:from-gray-600 disabled:to-gray-600 
                                               disabled:cursor-not-allowed text-white py-4 px-6 rounded-xl font-semibold 
                                               flex items-center justify-center gap-3 transition-all duration-300
                                               shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40"
                                >
                                    <Send className="w-5 h-5" />
                                    Send to Support
                                </button>

                                <p className="text-center text-white/40 text-sm">
                                    Our AI-powered support will analyze your issue and a support agent will review before responding.
                                </p>
                            </form>
                        )}

                        {/* SENDING: Brief loading state */}
                        {status === "sending" && (
                            <div className="text-center py-12">
                                <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-500/20 rounded-full mb-4">
                                    <div className="w-8 h-8 border-4 border-indigo-400 border-t-transparent rounded-full animate-spin"></div>
                                </div>
                                <p className="text-white font-medium">Submitting your issue...</p>
                            </div>
                        )}

                        {/* WAITING: Polling for resolution */}
                        {status === "waiting" && (
                            <div className="text-center py-12 space-y-6">
                                <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-amber-500/20 to-orange-500/20 rounded-full">
                                    <Clock className="w-10 h-10 text-amber-400 animate-pulse" />
                                </div>

                                <div>
                                    <h3 className="text-xl font-semibold text-white mb-2">Support is Reviewing Your Issue</h3>
                                    <p className="text-white/60">
                                        Our AI has analyzed your issue and a support agent is reviewing the proposed solution.
                                    </p>
                                </div>

                                {/* Status indicator */}
                                <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 px-4 py-2 rounded-full">
                                    <div className="w-2 h-2 bg-amber-400 rounded-full animate-pulse"></div>
                                    <span className="text-amber-300 text-sm">
                                        {sessionStatus === 'awaiting_approval'
                                            ? 'Awaiting human approval...'
                                            : sessionStatus === 'analyzing'
                                                ? 'AI is analyzing...'
                                                : 'Processing...'}
                                    </span>
                                </div>

                                {/* Progress steps */}
                                <div className="bg-white/5 rounded-xl p-6 mt-6">
                                    <div className="flex justify-between items-center">
                                        <Step label="Submitted" active completed />
                                        <StepConnector completed={sessionStatus !== 'analyzing'} />
                                        <Step label="AI Analysis" active completed={sessionStatus !== 'analyzing'} />
                                        <StepConnector completed={sessionStatus === 'awaiting_approval'} />
                                        <Step label="Human Review" active={sessionStatus === 'awaiting_approval'} />
                                        <StepConnector />
                                        <Step label="Dispatched" />
                                    </div>
                                </div>

                                <p className="text-white/40 text-sm">
                                    Session ID: <span className="font-mono">{sessionId}</span>
                                </p>
                            </div>
                        )}

                        {/* RESOLVED: Show the response */}
                        {status === "resolved" && (
                            <div className="space-y-6">
                                <div className="text-center">
                                    <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-green-500/20 to-emerald-500/20 rounded-full mb-4">
                                        <CheckCircle className="w-10 h-10 text-green-400" />
                                    </div>
                                    <h3 className="text-xl font-semibold text-white">Response from Support</h3>
                                </div>

                                <div className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 border border-green-500/30 rounded-xl p-6">
                                    <div className="flex items-start gap-3 mb-4">
                                        <div className="p-2 bg-green-500/20 rounded-lg">
                                            <Sparkles className="w-5 h-5 text-green-400" />
                                        </div>
                                        <div>
                                            <h4 className="font-semibold text-green-300">Official Resolution</h4>
                                            <p className="text-green-200/60 text-sm">Reviewed and approved by support</p>
                                        </div>
                                    </div>
                                    <div className="bg-black/20 rounded-lg p-4 border border-green-500/20">
                                        <p className="text-white/90 whitespace-pre-wrap leading-relaxed">{reply}</p>
                                    </div>
                                </div>

                                <button
                                    onClick={handleReset}
                                    className="w-full bg-white/10 hover:bg-white/20 border border-white/20 
                                               text-white py-3 px-6 rounded-xl font-medium transition-all"
                                >
                                    Submit Another Issue
                                </button>
                            </div>
                        )}

                        {/* ERROR: Show error state */}
                        {status === "error" && (
                            <div className="text-center py-12 space-y-6">
                                <div className="inline-flex items-center justify-center w-20 h-20 bg-red-500/20 rounded-full">
                                    <AlertCircle className="w-10 h-10 text-red-400" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-semibold text-white mb-2">Something went wrong</h3>
                                    <p className="text-red-300/80">{error}</p>
                                </div>
                                <button
                                    onClick={handleReset}
                                    className="bg-white/10 hover:bg-white/20 border border-white/20 
                                               text-white py-3 px-6 rounded-xl font-medium transition-all"
                                >
                                    Try Again
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <p className="text-center text-white/30 text-sm mt-6">
                    Powered by MigraGuard AI • Self-Healing Support System
                </p>
            </div>
        </div>
    );
}

// Helper components for the progress steps
function Step({ label, active, completed }) {
    return (
        <div className="flex flex-col items-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors
                ${completed ? 'bg-green-500 text-white' :
                    active ? 'bg-indigo-500 text-white' :
                        'bg-white/10 text-white/40'}`}>
                {completed ? <CheckCircle className="w-4 h-4" /> : ''}
            </div>
            <span className={`text-xs mt-2 ${active || completed ? 'text-white/80' : 'text-white/40'}`}>
                {label}
            </span>
        </div>
    );
}

function StepConnector({ completed }) {
    return (
        <div className={`flex-1 h-0.5 mx-2 transition-colors ${completed ? 'bg-green-500' : 'bg-white/10'}`} />
    );
}
