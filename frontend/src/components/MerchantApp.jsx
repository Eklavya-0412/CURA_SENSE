import React, { useState, useEffect } from 'react';
import { Send, MessageSquare, CheckCircle, Clock, AlertCircle, Sparkles, Loader2, Code, Terminal, ListChecks, X, Copy, Check, History, ChevronDown, ChevronUp, Key } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/**
 * MerchantApp - Standalone Merchant Portal (Port 3000)
 */
export default function MerchantApp() {
    const [input, setInput] = useState("");
    const [merchantId] = useState("MCH-DEMO-001");
    const [sessionId, setSessionId] = useState(null);
    const [reply, setReply] = useState(null);
    const [isWaiting, setIsWaiting] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const [sessionStatus, setSessionStatus] = useState(null);

    const [showFixPopup, setShowFixPopup] = useState(false);
    const [fixData, setFixData] = useState(null);
    const [copied, setCopied] = useState(false);
    const [apiKeyCopied, setApiKeyCopied] = useState(false);

    const [sessionHistory, setSessionHistory] = useState([]);
    const [showHistory, setShowHistory] = useState(false);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [expandedSession, setExpandedSession] = useState(null);

    // Theme toggle (internal state for now, defaults to dark)
    const [theme, setTheme] = useState('dark');

    // ... existing logic ...

    const copyConfig = () => {
        // Generate the auto-detection configuration JSON for the merchant to use
        const config = {
            merchant_id: merchantId,
            auto_heal: true,
            api_endpoint: API_BASE_URL,
            monitor_interval_ms: 5000
        };
        navigator.clipboard.writeText(JSON.stringify(config, null, 2));
        setApiKeyCopied(true);
        setTimeout(() => setApiKeyCopied(false), 2000);
    };

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

    // ... Polling useEffect ...

    return (
        <div className="min-h-screen bg-[#09090b] text-[#fafafa] flex flex-col items-center justify-center py-32 px-8 font-sans selection:bg-white selection:text-black relative" data-theme={theme}>
            {/* Minimalist Background - No Orbs for Monochrome look */}
            <div className="fixed inset-0 pointer-events-none z-[-1] opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(#333 1px, transparent 1px)', backgroundSize: '32px 32px' }}></div>

            {/* Top Right Config Button */}
            <div className="absolute top-10 right-10 animate-enter">
                <button
                    onClick={copyConfig}
                    className="flex items-center gap-3 px-6 py-3 rounded-xl border border-[#27272a] bg-[#18181b] text-[#a1a1aa] hover:text-white hover:border-white transition-all text-base font-medium group shadow-lg"
                >
                    {apiKeyCopied ? <Check className="w-5 h-5 text-green-500" /> : <Code className="w-5 h-5 group-hover:text-white" />}
                    {apiKeyCopied ? "JSON Copied!" : "Get Config JSON"}
                </button>
            </div>

            {/* Header */}
            <header className="mb-16 text-center animate-enter space-y-6">
                <div className="inline-flex items-center justify-center w-24 h-24 rounded-3xl bg-white text-black mb-8 shadow-[0_0_60px_-15px_rgba(255,255,255,0.3)]">
                    <Terminal className="w-12 h-12" />
                </div>
                <div>
                    <h1 className="text-6xl font-bold tracking-tight mb-4">Support Portal</h1>
                    <p className="text-[#a1a1aa] text-xl max-w-2xl mx-auto leading-relaxed">
                        Submit your technical issues below. Our automated system will analyze logs and propose a resolution.
                    </p>
                </div>
                <div className="inline-block mt-6 px-6 py-2 rounded-full border border-[#27272a] bg-[#18181b] text-base text-[#71717a] font-mono">
                    CLIENT_ID: <span className="text-white ml-2">{merchantId}</span>
                </div>
            </header>


            {/* Main Content */}
            <main className="max-w-3xl mx-auto relative perspective-1000 w-full">

                {/* Input Form */}
                {!isWaiting && !reply && (
                    <div className="w-full bg-[#18181b] border border-[#27272a] rounded-3xl p-10 shadow-2xl animate-enter">
                        <div className="relative mb-8">
                            <textarea
                                className="w-full bg-[#09090b] border border-[#27272a] rounded-2xl p-6 text-white placeholder-[#52525b] resize-none focus:outline-none focus:border-white focus:ring-1 focus:ring-white transition-all min-h-[220px] text-xl font-medium"
                                placeholder="Describe your issue here..."
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                disabled={isSubmitting}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4 mb-10">
                            {[
                                { text: "Failed Checkout (Critical)", val: "URGENT: Checkout page is throwing 500 Internal Server Error for all users. We are losing revenue!" },
                                { text: "API 503 Regression (High)", val: "API Gateway is returning 503 Service Unavailable periodically after the migration." },
                                { text: "Webhook 401 (Medium)", val: "Webhooks are failing with 401 Unauthorized errors since yesterday." },
                                { text: "Deprecated API (Low)", val: "Receiving warnings about deprecated API version v1 usage in our logs." }
                            ].map((item, i) => (
                                <button
                                    key={i}
                                    onClick={() => setInput(item.val)}
                                    disabled={isSubmitting}
                                    className="p-5 text-base font-medium rounded-xl bg-[#09090b] border border-[#27272a] text-[#a1a1aa] hover:text-white hover:border-white transition-all text-left"
                                >
                                    {item.text}
                                </button>
                            ))}
                        </div>

                        <div>
                            <button
                                onClick={handleSubmit}
                                disabled={!input.trim() || isSubmitting}
                                className="w-full bg-white text-black hover:bg-[#e4e4e7] py-5 rounded-2xl font-bold text-xl flex items-center justify-center gap-4 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-[0_0_40px_rgba(255,255,255,0.2)]"
                            >
                                {isSubmitting ? (
                                    <>
                                        <Loader2 className="w-6 h-6 animate-spin" />
                                        Processing...
                                    </>
                                ) : (
                                    <>
                                        <Send className="w-6 h-6" />
                                        Submit Ticket
                                    </>
                                )}
                            </button>
                        </div>

                        {error && (
                            <div className="mt-8 flex items-start gap-4 p-5 rounded-xl bg-[rgba(255,0,0,0.1)] border border-red-900 text-red-500">
                                <AlertCircle className="w-6 h-6 shrink-0" />
                                <span className="text-base font-medium">{error}</span>
                            </div>
                        )}
                    </div>
                )}

                {/* Waiting State (Glass Panel) */}
                {isWaiting && !reply && (
                    <div className="bg-[#18181b] border border-[#27272a] rounded-3xl p-16 text-center animate-enter relative overflow-hidden shadow-2xl">
                        {/* Shimmer overlay */}
                        <div className="absolute inset-0 shimmer opacity-20 pointer-events-none"></div>

                        <div className="inline-flex items-center justify-center w-32 h-32 rounded-full bg-[rgba(88,166,255,0.1)] mb-8 relative">
                            <div className="absolute inset-0 rounded-full border border-[var(--accent-primary)] opacity-30 animate-ping"></div>
                            <Clock className="w-16 h-16 text-[var(--accent-primary)]" />
                        </div>

                        <h2 className="text-4xl font-bold mb-4">Analyzing Issue</h2>
                        <p className="text-[#a1a1aa] text-lg max-w-lg mx-auto mb-10 leading-relaxed">
                            MigraGuard AI is diagnosing the problem. A support engineer will review the proposed solution shortly.
                        </p>

                        <div className="inline-flex border border-[#27272a] bg-[#09090b] px-8 py-4 rounded-full gap-4 items-center">
                            <div className="w-3 h-3 rounded-full bg-[var(--accent-warning)] animate-pulse"></div>
                            <span className="text-base font-medium text-[#a1a1aa]">
                                {sessionStatus === 'awaiting_approval'
                                    ? 'Waiting for human approval...'
                                    : sessionStatus === 'analyzing'
                                        ? 'Running diagnostic checks...'
                                        : 'Processing...'}
                            </span>
                        </div>
                    </div>
                )}

                {/* Success State (Result) */}
                {reply && (
                    <div className="animate-enter space-y-8">
                        <div className="bg-[#18181b] border border-[#27272a] rounded-3xl p-10 border-l-8 border-l-[var(--accent-success)] shadow-2xl">
                            <div className="flex items-center gap-6 mb-8">
                                <div className="w-16 h-16 rounded-full bg-[rgba(63,185,80,0.1)] flex items-center justify-center text-[var(--accent-success)]">
                                    <CheckCircle className="w-8 h-8" />
                                </div>
                                <div>
                                    <h2 className="text-3xl font-bold">Solution Approved</h2>
                                    <p className="text-[#a1a1aa] text-base mt-1">Review the fix below</p>
                                </div>
                            </div>

                            <div className="bg-[#09090b] border border-[#27272a] p-8 rounded-2xl">
                                <p className="whitespace-pre-wrap leading-relaxed text-lg text-[#fafafa]">
                                    {reply}
                                </p>
                            </div>

                            <button
                                onClick={handleReset}
                                className="mt-10 w-full bg-white text-black hover:bg-[#e4e4e7] py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-3 transition-colors"
                            >
                                <Sparkles className="w-5 h-5" />
                                Submit Another Issue
                            </button>
                        </div>
                    </div>
                )}

                {/* History Section */}
                <div className="mt-16 bg-[#18181b] border border-[#27272a] rounded-3xl overflow-hidden animate-enter" style={{ animationDelay: '0.1s' }}>
                    <button
                        onClick={async () => {
                            setShowHistory(!showHistory);
                            if (!showHistory && sessionHistory.length === 0) {
                                setHistoryLoading(true);
                                await refreshHistory();
                                setHistoryLoading(false);
                            }
                        }}
                        className="w-full flex items-center justify-between px-8 py-6 hover:bg-[#27272a] transition-colors"
                    >
                        <div className="flex items-center gap-4">
                            <History className="w-6 h-6 text-[var(--accent-primary)]" />
                            <span className="font-semibold text-lg">Session History</span>
                        </div>
                        {showHistory ? <ChevronUp className="w-6 h-6" /> : <ChevronDown className="w-6 h-6" />}
                    </button>

                    {showHistory && (
                        <div className="border-t border-[#27272a] bg-[#09090b] max-h-[600px] overflow-y-auto p-4 space-y-3">
                            {historyLoading ? (
                                <div className="text-center py-8 text-[#a1a1aa] text-lg">Loading...</div>
                            ) : sessionHistory.length === 0 ? (
                                <div className="text-center py-8 text-[#a1a1aa] text-lg">No history found</div>
                            ) : (
                                sessionHistory.map((session, idx) => (
                                    <div key={idx} className="bg-[#18181b] border border-[#27272a] rounded-xl hover:border-[#3f3f46] transition-colors">
                                        <div
                                            className="p-6 flex justify-between items-center cursor-pointer"
                                            onClick={() => setExpandedSession(expandedSession === session.id ? null : session.id)}
                                        >
                                            <div className="flex-1">
                                                <div className="flex justify-between items-center mb-2">
                                                    <span className={`text-xs font-bold uppercase px-3 py-1 rounded-full tracking-wide
                                                        ${session.status === 'dispatched' ? 'bg-[rgba(63,185,80,0.2)] text-[var(--accent-success)]' :
                                                            session.status === 'failed' ? 'bg-[rgba(248,81,73,0.2)] text-[var(--accent-danger)]' :
                                                                'bg-[rgba(210,153,34,0.2)] text-[var(--accent-warning)]'}`}
                                                    >
                                                        {session.status}
                                                    </span>
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-sm text-[#71717a]">
                                                            {new Date(session.created_at || session.timestamp).toLocaleDateString()}
                                                        </span>
                                                        <ChevronDown className={`w-4 h-4 text-[#a1a1aa] transition-transform ${expandedSession === session.id ? 'rotate-180' : ''}`} />
                                                    </div>
                                                </div>
                                                <p className="text-base text-[#d4d4d8] line-clamp-1 font-medium">
                                                    {session.issue || (session.diagnosis && session.diagnosis.root_cause) || "Issue #" + session.id.substring(0, 8)}
                                                </p>
                                            </div>
                                        </div>

                                        {expandedSession === session.id && (
                                            <div className="px-6 pb-6 animate-enter">
                                                <div className="bg-[#09090b] rounded-lg border border-[#27272a] overflow-hidden">
                                                    <div className="border-b border-[#27272a] px-4 py-2 bg-[#121212]">
                                                        <span className="text-xs font-mono text-[#a1a1aa]">
                                                            {session.status === 'awaiting_approval' ? 'PROPOSED_FIX' : 'APPLIED_SOLUTION'}
                                                        </span>
                                                    </div>
                                                    <div className="p-4 text-sm font-mono text-[var(--accent-success)] whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto">
                                                        {(() => {
                                                            try {
                                                                const parsed = typeof session.solution === 'string' ? JSON.parse(session.solution) : session.solution;
                                                                return parsed.content || session.solution;
                                                            } catch (e) {
                                                                return session.solution || "Solution detail not available.";
                                                            }
                                                        })()}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
            </main>

            {/* POPUP: Self-Healing Fix */}
            {showFixPopup && fixData && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-8 bg-black/80 backdrop-blur-xl animate-enter">
                    <div className="w-full max-w-4xl bg-[#0d1117] border border-[#30363d] rounded-2xl overflow-hidden shadow-2xl">

                        {/* Header */}
                        <div className="bg-[#161b22] p-8 border-b border-[#30363d] flex justify-between items-start">
                            <div className="flex items-center gap-6">
                                <div className="p-4 rounded-xl bg-[rgba(63,185,80,0.15)] text-[var(--accent-success)]">
                                    <Sparkles className="w-8 h-8" />
                                </div>
                                <div>
                                    <h3 className="text-3xl font-bold text-white">Fix Applied</h3>
                                    <div className="flex items-center gap-3 mt-2">
                                        <span className={`text-sm px-3 py-1 rounded border border-[rgba(255,255,255,0.2)] flex items-center gap-2 font-medium
                                            ${fixData.type === 'code_change' ? 'text-[var(--accent-success)]' : 'text-[var(--accent-primary)]'}`}>
                                            {getFixIcon(fixData.type)}
                                            {getFixLabel(fixData.type)}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <button onClick={() => setShowFixPopup(false)} className="text-[#8b949e] hover:text-white transition p-2 hover:bg-[#21262d] rounded-lg">
                                <X className="w-8 h-8" />
                            </button>
                        </div>

                        <div className="p-8">
                            <p className="text-[#c9d1d9] mb-8 text-lg leading-relaxed">
                                {fixData.description || "A fix has been prepared for your issue."}
                            </p>

                            {/* Code Window */}
                            <div className="border border-[#30363d] rounded-xl overflow-hidden mb-8 bg-[#0d1117]">
                                <div className="flex items-center gap-2 px-4 py-3 bg-[#161b22] border-b border-[#30363d]">
                                    <div className="w-3 h-3 rounded-full bg-[#fa7970]"></div>
                                    <div className="w-3 h-3 rounded-full bg-[#faa356]"></div>
                                    <div className="w-3 h-3 rounded-full bg-[#7ce38b]"></div>
                                    <span className="ml-3 text-sm text-[#8b949e] font-mono">
                                        {fixData.file || (fixData.type === 'cli_command' ? 'Terminal' : 'Instruction.txt')}
                                    </span>
                                </div>
                                <div className="relative group">
                                    <pre className={`p-6 text-base overflow-x-auto font-mono leading-relaxed
                                        ${fixData.type === 'cli_command' ? 'text-[var(--accent-primary)]' : 'text-[var(--accent-success)]'}
                                    `}>
                                        {fixData.solution}
                                    </pre>
                                    <button
                                        onClick={handleCopy}
                                        className="absolute top-4 right-4 p-3 rounded-lg bg-[rgba(255,255,255,0.1)] text-[#a1a1aa] opacity-0 group-hover:opacity-100 transition-all hover:text-white"
                                    >
                                        {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                                    </button>
                                </div>
                            </div>

                            {/* Footer Actions */}
                            <div className="flex gap-4">
                                <button
                                    onClick={() => setShowFixPopup(false)}
                                    className="flex-1 bg-[var(--accent-success)] hover:brightness-110 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-3 text-lg transition-transform active:scale-[0.98]"
                                >
                                    <CheckCircle className="w-6 h-6" />
                                    Acknowledge Fix
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
