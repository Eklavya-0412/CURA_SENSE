import React, { useState, useEffect } from 'react';
import { Send, CheckCircle, AlertCircle, Sparkles, Loader2, Code, Terminal, ListChecks, X, Copy, Check, History, ChevronDown } from 'lucide-react';
import { BrandMark, RiskBadge, StatusBadge } from './ui';
import { humanize, formatDateTime } from '../lib/format';

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
    const [historyUpdatedAt, setHistoryUpdatedAt] = useState(null);
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

    // Poll for updates
    useEffect(() => {
        if (!sessionId || !isWaiting) return;

        const pollInterval = setInterval(async () => {
            try {
                const res = await fetch(`${API_BASE_URL}/agent/session/${sessionId}`);
                if (!res.ok) return;

                const data = await res.json();
                setSessionStatus(data.status);

                if (data.status === 'completed' || data.status === 'awaiting_approval') {
                    clearInterval(pollInterval);
                    setIsWaiting(false);

                    // Parse solution if possible
                    let solutionText = data.solution;
                    let fixType = 'code_change';
                    let description = "A fix has been prepared for your issue.";

                    try {
                        const parsed = JSON.parse(data.solution);
                        if (parsed.content) solutionText = parsed.content;
                        if (parsed.type) fixType = parsed.type;
                        if (parsed.description) description = parsed.description;
                    } catch (e) {
                        // Use raw text
                    }

                    setReply(solutionText);
                    setFixData({
                        type: fixType,
                        solution: solutionText,
                        description: description,
                        file: data.diagnosis?.file || "instructions.txt"
                    });

                    // Only show popup for valid solutions
                    if (data.solution) {
                        setShowFixPopup(true);
                    }
                }
            } catch (error) {
                console.error("Polling error:", error);
            }
        }, 2000);

        return () => clearInterval(pollInterval);
    }, [sessionId, isWaiting]);

    // `silent` refreshes in the background without swapping the list for a skeleton
    const refreshHistory = async (silent = false) => {
        try {
            if (!silent) setHistoryLoading(true);
            const res = await fetch(`${API_BASE_URL}/agent/merchant/history/${merchantId}`);
            if (res.ok) {
                const data = await res.json();
                setSessionHistory(data.sessions || []);
                setHistoryUpdatedAt(new Date());
            }
        } catch (error) {
            console.error("Failed to load history:", error);
        } finally {
            if (!silent) setHistoryLoading(false);
        }
    };

    // Keep history current: load on mount, then refresh in the background every 10s
    useEffect(() => {
        refreshHistory();
        const interval = setInterval(() => refreshHistory(true), 10000);
        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [merchantId]);

    // Refresh as soon as a submitted ticket changes state (submitted, analyzing, resolved)
    useEffect(() => {
        if (sessionId) refreshHistory(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionId, sessionStatus, reply]);

    const handleReset = () => {
        setInput("");
        setSessionId(null);
        setReply(null);
        setIsWaiting(false);
        setError(null);
        setSessionStatus(null);
        setShowFixPopup(false);
        setFixData(null);
    };

    const handleCopy = () => {
        if (fixData?.solution) {
            navigator.clipboard.writeText(fixData.solution);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const getFixIcon = (type) => {
        switch (type) {
            case 'code_change': return <Code />;
            case 'cli_command': return <Terminal />;
            default: return <ListChecks />;
        }
    };

    const getFixLabel = (type) => {
        switch (type) {
            case 'code_change': return "Code Patch";
            case 'cli_command': return "Terminal Command";
            default: return "Instruction";
        }
    };

    const quickTemplates = [
        { text: "Failed checkout", severity: "critical", val: "URGENT: Checkout page is throwing 500 Internal Server Error for all users. We are losing revenue!" },
        { text: "API 503 regression", severity: "high", val: "API Gateway is returning 503 Service Unavailable periodically after the migration." },
        { text: "Webhook 401 errors", severity: "medium", val: "Webhooks are failing with 401 Unauthorized errors since yesterday." },
        { text: "Deprecated API warnings", severity: "low", val: "Receiving warnings about deprecated API version v1 usage in our logs." }
    ];

    const parseSolution = (session) => {
        try {
            const parsed = typeof session.solution === 'string' ? JSON.parse(session.solution) : session.solution;
            return parsed.content || session.solution;
        } catch {
            return session.solution || "Solution detail not available.";
        }
    };

    return (
        <div className="min-h-screen bg-canvas text-fg flex flex-col" data-theme={theme}>
            {/* Top bar */}
            <header className="sticky top-0 z-30 border-b border-line bg-canvas/90 backdrop-blur">
                <div className="max-w-5xl mx-auto h-16 px-4 sm:px-6 flex items-center justify-between gap-4">
                    <BrandMark subtitle="Merchant support" />
                    <div className="flex items-center gap-2">
                        <span className="kbd-chip hidden sm:inline-flex">
                            CLIENT_ID <span className="text-fg">{merchantId}</span>
                        </span>
                        <button onClick={copyConfig} className="btn btn-secondary btn-sm">
                            {apiKeyCopied ? <Check className="text-success" /> : <Code />}
                            {apiKeyCopied ? "Copied" : "Config JSON"}
                        </button>
                    </div>
                </div>
            </header>

            <main className="flex-1 w-full max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
                {/* Page heading */}
                <div className="mb-6 animate-enter">
                    <h1 className="t-h1 sm:text-2xl sm:leading-8">How can we help with your migration?</h1>
                    <p className="t-body mt-1.5 max-w-2xl">
                        Describe what's failing. CuraSense analyzes your logs, diagnoses the root cause and proposes a fix — high-risk changes are reviewed by an engineer before they're applied.
                    </p>
                </div>

                {/* Input form */}
                {!isWaiting && !reply && (
                    <section className="card animate-enter">
                        <div className="p-5 sm:p-6">
                            <label htmlFor="issue" className="field-label">Issue description</label>
                            <textarea
                                id="issue"
                                className="input resize-y min-h-[148px]"
                                placeholder="e.g. Checkout returns a 500 error after migrating to the v2 orders API…"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                disabled={isSubmitting}
                            />
                            <div className="flex items-start justify-between gap-4 mt-1.5">
                                <span className="t-meta">Include error codes, endpoints and when it started.</span>
                                <span className="t-meta t-num whitespace-nowrap shrink-0">{input.length} chars</span>
                            </div>

                            <div className="mt-5">
                                <div className="t-overline mb-2">Common issues</div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {quickTemplates.map((item, i) => (
                                        <button
                                            key={i}
                                            onClick={() => setInput(item.val)}
                                            disabled={isSubmitting}
                                            className={`flex items-center justify-between gap-3 h-10 px-3 rounded-lg border text-left text-[13px] font-medium transition-colors
                                                ${input === item.val ? 'border-accent/60 bg-accent/10 text-fg' : 'border-line bg-surface-2 text-fg-muted hover:text-fg hover:border-line-strong'}`}
                                        >
                                            <span className="truncate">{item.text}</span>
                                            <RiskBadge level={item.severity} />
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {error && (
                                <div className="mt-5 flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-danger/10 border border-danger/30 text-[13px] text-[#ff8a8a]">
                                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                                    <span>{error}</span>
                                </div>
                            )}
                        </div>

                        <div className="px-5 sm:px-6 py-3.5 border-t border-line bg-surface-2/50 flex items-center justify-between gap-3 rounded-b-xl">
                            <span className="t-meta hidden sm:inline">Typical diagnosis time: under a minute</span>
                            <button
                                onClick={handleSubmit}
                                disabled={!input.trim() || isSubmitting}
                                className="btn btn-primary w-full sm:w-auto"
                            >
                                {isSubmitting ? (
                                    <>
                                        <Loader2 className="animate-spin" />
                                        Submitting…
                                    </>
                                ) : (
                                    <>
                                        <Send />
                                        Submit ticket
                                    </>
                                )}
                            </button>
                        </div>
                    </section>
                )}

                {/* Waiting state */}
                {isWaiting && !reply && (
                    <section className="card p-6 sm:p-8 animate-enter">
                        <div className="flex items-start gap-4">
                            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-accent/15 text-accent shrink-0">
                                <Loader2 className="w-5 h-5 animate-spin" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <h2 className="t-h2">Analyzing your issue</h2>
                                <p className="t-body mt-1">
                                    The CuraSense agent is diagnosing the problem. If the proposed fix is high-risk, a support engineer will review it before it reaches you.
                                </p>
                                <div className="mt-4 flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-warning animate-pulse" />
                                    <span className="text-[13px] font-medium text-fg-muted">
                                        {sessionStatus === 'awaiting_approval'
                                            ? 'Waiting for human approval…'
                                            : sessionStatus === 'analyzing'
                                                ? 'Running diagnostic checks…'
                                                : 'Processing…'}
                                    </span>
                                </div>
                                {sessionId && <div className="t-mono text-fg-subtle mt-3">Session {sessionId}</div>}
                            </div>
                        </div>
                    </section>
                )}

                {/* Result */}
                {reply && (
                    <section className="card overflow-hidden animate-enter">
                        <div className="px-5 sm:px-6 py-4 border-b border-line flex items-center gap-3">
                            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-success/15 text-success shrink-0">
                                <CheckCircle className="w-[18px] h-[18px]" />
                            </div>
                            <div className="min-w-0">
                                <h2 className="t-h2">Solution approved</h2>
                                <p className="t-meta mt-0.5">Review the fix below and apply it to your store.</p>
                            </div>
                        </div>
                        <div className="p-5 sm:p-6">
                            <div className="code-block">
                                <div className="code-block-header">
                                    <span>{fixData?.file || 'resolution.txt'}</span>
                                    <button onClick={handleCopy} className="flex items-center gap-1.5 hover:text-fg transition-colors">
                                        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                        {copied ? 'Copied' : 'Copy'}
                                    </button>
                                </div>
                                <div className="code-block-body text-fg">{reply}</div>
                            </div>
                        </div>
                        <div className="px-5 sm:px-6 py-3.5 border-t border-line bg-surface-2/50 flex justify-end">
                            <button onClick={handleReset} className="btn btn-secondary">
                                <Sparkles />
                                Submit another issue
                            </button>
                        </div>
                    </section>
                )}

                {/* History */}
                <section className="card mt-6 overflow-hidden animate-enter" style={{ animationDelay: '60ms' }}>
                    <button
                        onClick={() => {
                            const opening = !showHistory;
                            setShowHistory(opening);
                            if (opening) refreshHistory(sessionHistory.length > 0);
                        }}
                        className="w-full flex items-center justify-between gap-3 px-5 sm:px-6 h-14 hover:bg-surface-2 transition-colors"
                        aria-expanded={showHistory}
                    >
                        <span className="flex items-center gap-2.5">
                            <History className="w-4 h-4 text-fg-subtle" />
                            <span className="t-h3">Session history</span>
                            {sessionHistory.length > 0 && <span className="badge badge-neutral t-num">{sessionHistory.length}</span>}
                        </span>
                        <span className="flex items-center gap-3">
                            {historyUpdatedAt && (
                                <span className="t-meta hidden sm:inline">Updated {historyUpdatedAt.toLocaleTimeString()}</span>
                            )}
                            <ChevronDown className={`w-4 h-4 text-fg-subtle transition-transform ${showHistory ? 'rotate-180' : ''}`} />
                        </span>
                    </button>

                    {showHistory && (
                        <div className="border-t border-line max-h-[520px] overflow-y-auto">
                            {historyLoading ? (
                                <div className="p-5 space-y-2">
                                    {[0, 1, 2].map((i) => <div key={i} className="skeleton h-12" />)}
                                </div>
                            ) : sessionHistory.length === 0 ? (
                                <div className="px-6 py-10 text-center t-body">No previous sessions for this merchant.</div>
                            ) : (
                                <ul className="divide-y divide-line">
                                    {sessionHistory.map((session, idx) => {
                                        const open = expandedSession === session.id;
                                        return (
                                            <li key={idx}>
                                                <button
                                                    className="w-full px-5 sm:px-6 py-3.5 flex items-center gap-3 text-left hover:bg-surface-2 transition-colors"
                                                    onClick={() => setExpandedSession(open ? null : session.id)}
                                                    aria-expanded={open}
                                                >
                                                    <StatusBadge status={session.status} />
                                                    <span className="flex-1 min-w-0">
                                                        <span className="block text-[13px] font-medium text-fg truncate">
                                                            {session.issue || (session.diagnosis && humanize(session.diagnosis.root_cause)) || "Issue #" + session.id.substring(0, 8)}
                                                        </span>
                                                        {session.issue && session.diagnosis?.root_cause && (
                                                            <span className="block t-meta truncate mt-0.5">{humanize(session.diagnosis.root_cause)}</span>
                                                        )}
                                                    </span>
                                                    <span className="t-meta whitespace-nowrap t-num">
                                                        {formatDateTime(session.created_at || session.timestamp)}
                                                    </span>
                                                    <ChevronDown className={`w-4 h-4 text-fg-subtle shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
                                                </button>

                                                {open && (
                                                    <div className="px-5 sm:px-6 pb-4 animate-enter">
                                                        <div className="code-block">
                                                            <div className="code-block-header">
                                                                <span>{session.status === 'awaiting_approval' ? 'proposed_fix' : 'applied_solution'}</span>
                                                            </div>
                                                            <div className="code-block-body max-h-60 overflow-y-auto">
                                                                {parseSolution(session)}
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </div>
                    )}
                </section>
            </main>

            <footer className="border-t border-line">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 h-12 flex items-center justify-between t-meta">
                    <span>© 2026 CuraSense</span>
                    <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-success" />All systems operational</span>
                </div>
            </footer>

            {/* Fix popup */}
            {showFixPopup && fixData && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6" role="dialog" aria-modal="true" aria-label="Fix ready">
                    <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowFixPopup(false)} />
                    <div className="relative w-full sm:max-w-2xl bg-surface border border-line-strong rounded-t-2xl sm:rounded-2xl shadow-[var(--shadow-lg)] overflow-hidden animate-enter max-h-[92vh] flex flex-col">
                        <div className="px-5 sm:px-6 py-4 border-b border-line flex items-start justify-between gap-4">
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-success/15 text-success shrink-0">
                                    <Sparkles className="w-[18px] h-[18px]" />
                                </div>
                                <div className="min-w-0">
                                    <h3 className="t-h1">Fix ready</h3>
                                    <span className={`badge mt-1 ${fixData.type === 'code_change' ? 'badge-success' : 'badge-accent'}`}>
                                        {getFixIcon(fixData.type)}
                                        {getFixLabel(fixData.type)}
                                    </span>
                                </div>
                            </div>
                            <button onClick={() => setShowFixPopup(false)} className="btn btn-ghost btn-icon -mr-2 shrink-0" aria-label="Close">
                                <X />
                            </button>
                        </div>

                        <div className="px-5 sm:px-6 py-5 overflow-y-auto">
                            <p className="t-body text-fg-muted mb-4">
                                {fixData.description || "A fix has been prepared for your issue."}
                            </p>
                            <div className="code-block">
                                <div className="code-block-header">
                                    <span className="flex items-center gap-2">
                                        {fixData.type === 'cli_command' ? <Terminal className="w-3.5 h-3.5" /> : <Code className="w-3.5 h-3.5" />}
                                        {fixData.file || (fixData.type === 'cli_command' ? 'Terminal' : 'Instruction.txt')}
                                    </span>
                                    <button onClick={handleCopy} className="flex items-center gap-1.5 hover:text-fg transition-colors">
                                        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                        {copied ? 'Copied' : 'Copy'}
                                    </button>
                                </div>
                                <pre className={`code-block-body ${fixData.type === 'cli_command' ? 'text-[#8fb6ff]' : 'text-[#7fdcb0]'}`}>
                                    {fixData.solution}
                                </pre>
                            </div>
                        </div>

                        <div className="px-5 sm:px-6 py-3.5 border-t border-line bg-surface-2/50 flex justify-end">
                            <button onClick={() => setShowFixPopup(false)} className="btn btn-success w-full sm:w-auto">
                                <CheckCircle />
                                Acknowledge fix
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
