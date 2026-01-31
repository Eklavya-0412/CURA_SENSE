import React, { useState, useEffect } from 'react';
import { Send, MessageSquare, CheckCircle, Clock, AlertCircle, Sparkles, Loader2, Code, Terminal, ListChecks, X, Copy, Check } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/**
 * MerchantApp - Standalone Merchant Portal (Port 3000)
 * 
 * This is a dedicated application for merchants to:
 * 1. Submit migration issues
 * 2. Wait for AI analysis and human approval
 * 3. Receive the approved solution (code fix, CLI command, or manual steps)
 * 
 * The merchant never sees internal AI reasoning - only the final approved solution.
 */
export default function MerchantApp() {
    const [input, setInput] = useState("");
    const [merchantId, setMerchantId] = useState("MCH-" + Math.random().toString(36).substring(2, 8).toUpperCase());
    const [sessionId, setSessionId] = useState(null);
    const [reply, setReply] = useState(null);
    const [isWaiting, setIsWaiting] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const [sessionStatus, setSessionStatus] = useState(null);

    // NEW: State for fix popup
    const [showFixPopup, setShowFixPopup] = useState(false);
    const [fixData, setFixData] = useState(null);
    const [copied, setCopied] = useState(false);

    // Handle form submission
    const handleSubmit = async () => {
        if (!input.trim()) return;

        setIsSubmitting(true);
        setError(null);

        try {
            const res = await fetch(`${API_BASE_URL}/agent/merchant/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: input,
                    merchant_id: merchantId
                })
            });

            if (!res.ok) {
                throw new Error('Failed to submit issue');
            }

            const data = await res.json();
            setSessionId(data.session_id);
            setIsWaiting(true);
            setIsSubmitting(false);
        } catch (err) {
            setError(err.message);
            setIsSubmitting(false);
        }
    };

    // Polling loop - Poll every 3 seconds for human approval
    // UPDATED: Now uses /merchant/view for structured fix data
    useEffect(() => {
        if (!sessionId || fixData) return;

        const interval = setInterval(async () => {
            try {
                // First check poll endpoint for basic status
                const pollRes = await fetch(`${API_BASE_URL}/agent/merchant/poll/${sessionId}`);
                if (!pollRes.ok) return;
                const pollData = await pollRes.json();
                setSessionStatus(pollData.session_status);

                // Then check the view endpoint for structured fix data
                const viewRes = await fetch(`${API_BASE_URL}/agent/merchant/view/${sessionId}`);
                if (!viewRes.ok) return;
                const viewData = await viewRes.json();

                if (viewData.status === "resolved") {
                    // NEW: Store structured fix data and show popup
                    setFixData(viewData);
                    setReply(viewData.solution);
                    setShowFixPopup(true);
                    setIsWaiting(false);
                    clearInterval(interval);
                }
            } catch (err) {
                console.error('Polling error:', err);
            }
        }, 3000);

        return () => clearInterval(interval);
    }, [sessionId, fixData]);

    // Reset everything for a new submission
    const handleReset = () => {
        setInput("");
        setSessionId(null);
        setReply(null);
        setIsWaiting(false);
        setError(null);
        setSessionStatus(null);
        setFixData(null);
        setShowFixPopup(false);
        setCopied(false);
    };

    // Copy solution to clipboard
    const handleCopy = () => {
        if (fixData?.solution) {
            navigator.clipboard.writeText(fixData.solution);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    // Get icon based on fix type
    const getFixIcon = (type) => {
        switch (type) {
            case 'code_change': return <Code className="w-5 h-5" />;
            case 'cli_command': return <Terminal className="w-5 h-5" />;
            default: return <ListChecks className="w-5 h-5" />;
        }
    };

    // Get label based on fix type
    const getFixLabel = (type) => {
        switch (type) {
            case 'code_change': return 'Code Fix';
            case 'cli_command': return 'Terminal Command';
            default: return 'Manual Steps';
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white">
            {/* Background decoration */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-20 left-10 w-72 h-72 bg-indigo-500/10 rounded-full blur-3xl"></div>
                <div className="absolute bottom-20 right-10 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl"></div>
            </div>

            {/* Header */}
            <header className="relative border-b border-white/10 backdrop-blur-sm">
                <div className="max-w-4xl mx-auto px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-indigo-500/20 rounded-xl">
                                <MessageSquare className="w-6 h-6 text-indigo-400" />
                            </div>
                            <div>
                                <h1 className="text-xl font-bold text-white">Merchant Help Desk</h1>
                                <p className="text-sm text-indigo-300">MigraGuard Migration Support</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-xs text-slate-400">Merchant ID</div>
                            <div className="font-mono text-sm text-indigo-300">{merchantId}</div>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="relative max-w-2xl mx-auto px-6 py-12">

                {/* Input Form - Only show when not waiting and no reply */}
                {!isWaiting && !reply && (
                    <div className="space-y-6 animate-fade-in">
                        <div className="text-center mb-8">
                            <h2 className="text-2xl font-bold mb-2">How can we help?</h2>
                            <p className="text-slate-400">Describe your migration issue and our team will assist you</p>
                        </div>

                        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
                            <textarea
                                className="w-full bg-slate-800/50 border border-slate-700 rounded-xl p-4 text-white placeholder-slate-500 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition min-h-[150px]"
                                placeholder="Example: I'm getting 504 errors on the checkout page after the migration. The API returns a timeout when processing payments..."
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                disabled={isSubmitting}
                            />

                            <button
                                onClick={handleSubmit}
                                disabled={!input.trim() || isSubmitting}
                                className="w-full mt-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:from-slate-600 disabled:to-slate-600 disabled:cursor-not-allowed text-white py-4 rounded-xl font-semibold flex items-center justify-center gap-3 transition-all duration-300 shadow-lg shadow-indigo-500/25"
                            >
                                {isSubmitting ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        Submitting...
                                    </>
                                ) : (
                                    <>
                                        <Send className="w-5 h-5" />
                                        Send to Support
                                    </>
                                )}
                            </button>
                        </div>

                        {error && (
                            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center gap-3">
                                <AlertCircle className="w-5 h-5 text-red-400" />
                                <span className="text-red-300">{error}</span>
                            </div>
                        )}
                    </div>
                )}

                {/* Waiting State */}
                {isWaiting && !reply && (
                    <div className="text-center space-y-8 animate-fade-in">
                        <div className="inline-flex items-center justify-center w-24 h-24 bg-indigo-500/20 rounded-full">
                            <Clock className="w-12 h-12 text-indigo-400 animate-pulse" />
                        </div>

                        <div>
                            <h2 className="text-2xl font-bold mb-3">Support is Reviewing</h2>
                            <p className="text-slate-400 max-w-md mx-auto">
                                Our AI has analyzed your issue and a support agent is reviewing the proposed solution.
                            </p>
                        </div>

                        {/* Animated status indicator */}
                        <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-2xl p-6">
                            <div className="flex items-center justify-center gap-3 mb-4">
                                <div className="w-3 h-3 bg-indigo-400 rounded-full animate-pulse"></div>
                                <span className="text-indigo-300 font-medium">
                                    {sessionStatus === 'awaiting_approval'
                                        ? 'Awaiting human approval...'
                                        : sessionStatus === 'analyzing'
                                            ? 'AI is analyzing your issue...'
                                            : 'Processing your request...'}
                                </span>
                            </div>
                            <div className="text-xs text-slate-500 font-mono">
                                Session: {sessionId}
                            </div>
                        </div>

                        {/* Your submitted issue */}
                        <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-left">
                            <div className="text-xs text-slate-500 mb-2">Your submitted issue:</div>
                            <p className="text-slate-300 text-sm">{input}</p>
                        </div>
                    </div>
                )}

                {/* Solution Received */}
                {reply && (
                    <div className="space-y-6 animate-fade-in">
                        <div className="text-center">
                            <div className="inline-flex items-center justify-center w-20 h-20 bg-green-500/20 rounded-full mb-4">
                                <CheckCircle className="w-10 h-10 text-green-400" />
                            </div>
                            <h2 className="text-2xl font-bold text-white">Solution Approved</h2>
                            <p className="text-slate-400">Our support team has reviewed and approved this solution</p>
                        </div>

                        {/* Solution Box */}
                        <div className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 border border-green-500/30 rounded-2xl overflow-hidden">
                            <div className="bg-green-500/20 px-6 py-4 border-b border-green-500/20 flex items-center gap-3">
                                <Sparkles className="w-5 h-5 text-green-400" />
                                <span className="font-semibold text-green-300">Approved Solution</span>
                            </div>
                            <div className="p-6">
                                <p className="text-white/90 whitespace-pre-wrap leading-relaxed">{reply}</p>
                            </div>
                        </div>

                        {/* Submit Another */}
                        <button
                            onClick={handleReset}
                            className="w-full bg-white/10 hover:bg-white/20 border border-white/20 text-white py-3 rounded-xl font-medium transition-all"
                        >
                            Submit Another Issue
                        </button>
                    </div>
                )}
            </main>

            {/* Footer */}
            <footer className="fixed bottom-0 left-0 right-0 py-4 text-center text-slate-500 text-sm border-t border-white/5 backdrop-blur-sm">
                Powered by MigraGuard Self-Healing AI • Port 3000
            </footer>

            {/* ========== SELF-HEALING FIX POPUP ========== */}
            {showFixPopup && fixData && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
                    <div className="bg-gradient-to-br from-slate-900 to-slate-800 border border-indigo-500/50 rounded-2xl p-6 max-w-2xl w-full shadow-2xl shadow-indigo-500/20">
                        {/* Header */}
                        <div className="flex justify-between items-start mb-6">
                            <div className="flex items-center gap-3">
                                <div className="p-3 bg-green-500/20 rounded-xl">
                                    <Sparkles className="w-6 h-6 text-green-400" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-white">Self-Healing Fix Applied</h3>
                                    <p className="text-sm text-slate-400">Approved by support team</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowFixPopup(false)}
                                className="p-2 hover:bg-white/10 rounded-lg transition"
                            >
                                <X className="w-5 h-5 text-gray-400 hover:text-white" />
                            </button>
                        </div>

                        {/* Description */}
                        <p className="text-gray-300 mb-6 leading-relaxed">
                            {fixData.description || "A fix has been prepared for your issue."}
                        </p>

                        {/* Fix Type Badge */}
                        <div className="flex items-center gap-2 mb-4">
                            <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium
                                ${fixData.type === 'code_change' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' :
                                    fixData.type === 'cli_command' ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' :
                                        'bg-amber-500/20 text-amber-300 border border-amber-500/30'}`}
                            >
                                {getFixIcon(fixData.type)}
                                {getFixLabel(fixData.type)}
                            </span>
                            {fixData.estimated_time && (
                                <span className="text-xs text-slate-500 flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {fixData.estimated_time}
                                </span>
                            )}
                            {fixData.risk_level && (
                                <span className={`text-xs px-2 py-0.5 rounded-full
                                    ${fixData.risk_level === 'low' ? 'bg-green-500/20 text-green-400' :
                                        fixData.risk_level === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                                            'bg-red-500/20 text-red-400'}`}
                                >
                                    {fixData.risk_level} risk
                                </span>
                            )}
                        </div>

                        {/* Solution Code Box */}
                        <div className="bg-black/60 rounded-xl border border-slate-700 overflow-hidden">
                            {/* File path header (for code changes) */}
                            {fixData.file && (
                                <div className="px-4 py-2 bg-slate-800/50 border-b border-slate-700 flex items-center gap-2">
                                    <Code className="w-4 h-4 text-slate-400" />
                                    <span className="text-sm text-slate-400 font-mono">{fixData.file}</span>
                                </div>
                            )}

                            {/* Command label for CLI */}
                            {fixData.type === 'cli_command' && (
                                <div className="px-4 py-2 bg-slate-800/50 border-b border-slate-700 flex items-center gap-2">
                                    <Terminal className="w-4 h-4 text-purple-400" />
                                    <span className="text-sm text-purple-400 font-mono">Terminal Command</span>
                                </div>
                            )}

                            {/* Solution content */}
                            <div className="p-4 relative">
                                <pre className={`font-mono text-sm overflow-x-auto whitespace-pre-wrap leading-relaxed
                                    ${fixData.type === 'code_change' ? 'text-green-400' :
                                        fixData.type === 'cli_command' ? 'text-cyan-400' :
                                            'text-gray-300'}`}
                                >
                                    {fixData.solution}
                                </pre>

                                {/* Copy button */}
                                <button
                                    onClick={handleCopy}
                                    className="absolute top-3 right-3 p-2 bg-slate-700/50 hover:bg-slate-600 rounded-lg transition flex items-center gap-2"
                                    title="Copy to clipboard"
                                >
                                    {copied ? (
                                        <>
                                            <Check className="w-4 h-4 text-green-400" />
                                            <span className="text-xs text-green-400">Copied!</span>
                                        </>
                                    ) : (
                                        <Copy className="w-4 h-4 text-slate-400" />
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="mt-6 flex gap-3">
                            <button
                                onClick={() => setShowFixPopup(false)}
                                className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 py-3 rounded-xl font-bold transition-all shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2"
                            >
                                <CheckCircle className="w-5 h-5" />
                                Acknowledge & Close
                            </button>
                            <button
                                onClick={handleCopy}
                                className="px-6 bg-white/10 hover:bg-white/20 border border-white/20 py-3 rounded-xl font-medium transition-all flex items-center gap-2"
                            >
                                {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                                Copy
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Custom animation styles */}
            <style>{`
                @keyframes fade-in {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-fade-in {
                    animation: fade-in 0.3s ease-out;
                }
            `}</style>
        </div>
    );
}
