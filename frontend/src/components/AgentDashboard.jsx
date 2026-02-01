import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Activity, AlertTriangle, CheckCircle, Clock,
    FileText, Server, Shield, Brain, X,
    ThumbsUp, ThumbsDown, RefreshCw, BarChart2, Bell
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { getAgentMetrics, getSessionHistory, getApprovalQueue, approveAction, getAnalytics } from '../api/client';

// Spring configurations for physics-based animations
const springConfig = { type: "spring", stiffness: 400, damping: 25 };
const buttonSpring = { type: "spring", stiffness: 500, damping: 30 };

export default function AgentDashboard() {
    const [activeTab, setActiveTab] = useState('live');
    const [metrics, setMetrics] = useState(null);
    const [history, setHistory] = useState([]);
    const [queue, setQueue] = useState([]);
    const [analytics, setAnalytics] = useState(null);
    const [activeResult, setActiveResult] = useState(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [showToast, setShowToast] = useState(false);
    const prevHistoryLength = useRef(0);

    // Theme state (internal default dark)
    const [theme, setTheme] = useState('dark');

    // -------------------------------------------------------------------------
    // BACKEND LOGIC
    // -------------------------------------------------------------------------
    useEffect(() => {
        refreshData();
        const interval = setInterval(refreshData, 10000);
        return () => clearInterval(interval);
    }, []);

    const refreshData = async () => {
        setIsRefreshing(true);
        try {
            const [m, h, q, a] = await Promise.all([
                getAgentMetrics(),
                getSessionHistory(),
                getApprovalQueue(),
                getAnalytics()
            ]);
            setMetrics(m);
            setHistory(h.sessions || []);
            setQueue(q.items || []);
            setAnalytics(a);

            // Check for new tickets
            const currentCount = h.sessions ? h.sessions.length : 0;
            if (prevHistoryLength.current > 0 && currentCount > prevHistoryLength.current) {
                setShowToast(true);
                setTimeout(() => setShowToast(false), 5000);
            }
            prevHistoryLength.current = currentCount;

        } catch (error) {
            console.error("Failed to fetch data:", error);
        }
        setIsRefreshing(false);
    };

    const handleApproval = async (id, approved) => {
        try {
            await approveAction({
                approval_id: id,
                approved: approved,
                reviewer_notes: approved ? "Approved via dashboard" : "Rejected via dashboard"
            });
            refreshData();
            alert(approved ? "Action Approved" : "Action Rejected");
        } catch (error) {
            alert("Operation failed: " + error.message);
        }
    };
    // -------------------------------------------------------------------------
    // END BACKEND LOGIC
    // -------------------------------------------------------------------------

    return (
        <div className="min-h-screen bg-[var(--bg-color)] text-[var(--text-primary)] font-['SF_Pro_Display',_'Inter',_system-ui,_sans-serif] overflow-x-hidden pb-28" data-theme={theme}>
            {/* Background Gradient Orbs - REMOVED for "Less AI" look */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
                <div className="absolute top-0 left-0 w-full h-full bg-[#0d1117] opacity-100" />
            </div>

            {/* Header */}
            <header className="relative z-10 px-8 pt-12 pb-6 flex flex-col items-center justify-center text-center">
                <div className="flex flex-col items-center gap-8">
                    <div className="flex items-center gap-4 bg-[rgba(255,255,255,0.05)] px-8 py-4 rounded-full border border-[rgba(255,255,255,0.1)]">
                        <Shield className="w-8 h-8 text-[var(--accent-primary)]" />
                        <h1 className="text-2xl font-bold tracking-tight text-white">System Operations Console</h1>
                    </div>

                    <div className="flex items-center gap-6">
                        {/* Metrics Pills - Larger */}
                        {metrics && (
                            <div className="flex gap-6">
                                <MetricPill label="Success Rate" value={`${(metrics.success_rate * 100).toFixed(0)}%`} size="large" />
                                <MetricPill label="Total Sessions" value={metrics.total_sessions} size="large" />
                            </div>
                        )}

                        {/* Refresh Button */}
                        <motion.button
                            onClick={refreshData}
                            className="bg-[#21262d] border border-[#30363d] text-[#c9d1d9] px-6 py-3 rounded-xl flex items-center gap-3 text-base hover:bg-[#30363d] transition-colors"
                            whileTap={{ scale: 0.97 }}
                            transition={buttonSpring}
                        >
                            <motion.div
                                animate={{ rotate: isRefreshing ? 360 : 0 }}
                                transition={{ duration: 1, repeat: isRefreshing ? Infinity : 0, ease: "linear" }}
                            >
                                <RefreshCw className="w-5 h-5" />
                            </motion.div>
                            Sync Data
                        </motion.button>
                    </div>
                </div>

                {/* Page Title */}
                <div className="max-w-4xl mx-auto mt-12 mb-10">
                    <h2 className="text-5xl font-bold tracking-tight text-white mb-4">
                        {activeTab === 'live' && 'Live Issue Analysis'}
                        {activeTab === 'queue' && 'Action Approvals'}
                        {activeTab === 'analytics' && 'System Analytics'}
                        {activeTab === 'history' && 'Past Sessions'}
                    </h2>
                    <p className="text-[#8b949e] text-xl tracking-wide">
                        {activeTab === 'live' && 'Monitor active sessions and diagnostics in real-time'}
                        {activeTab === 'queue' && 'Review and approve pending automated fixes'}
                        {activeTab === 'analytics' && 'Performance metrics and system health trends'}
                        {activeTab === 'history' && 'Audit log of all agent activities'}
                    </p>
                </div>
            </header>

            {/* Main Content Area */}
            <main className="relative z-10 px-8">
                <div className="max-w-7xl mx-auto">
                    {activeTab === 'live' && (
                        <LiveAnalysisView
                            history={history}
                            activeResult={activeResult}
                            setActiveResult={setActiveResult}
                            handleApproval={handleApproval}
                        />
                    )}

                    {activeTab === 'queue' && (
                        <QueueView queue={queue} handleApproval={handleApproval} />
                    )}

                    {activeTab === 'analytics' && (
                        <AnalyticsView analytics={analytics} />
                    )}

                    {activeTab === 'history' && (
                        <HistoryView history={history} />
                    )}
                </div>
            </main>

            {/* New Ticket Toast */}
            <AnimatePresence>
                {showToast && (
                    <motion.div
                        initial={{ opacity: 0, y: -20, x: '-50%' }}
                        animate={{ opacity: 1, y: 0, x: '-50%' }}
                        exit={{ opacity: 0, y: -20, x: '-50%' }}
                        className="fixed top-8 left-1/2 transform -translate-x-1/2 z-50 glass-card px-8 py-6 flex items-center gap-6 border-[var(--accent-primary)] shadow-[0_0_40px_rgba(88,166,255,0.3)]"
                    >
                        <div className="p-3 bg-[rgba(88,166,255,0.2)] rounded-full text-[var(--accent-primary)] animate-pulse">
                            <Bell className="w-8 h-8" />
                        </div>
                        <div>
                            <h4 className="font-bold text-xl">New Ticket Detected</h4>
                            <p className="text-sm text-[var(--text-secondary)]">Analyzing incoming issue...</p>
                        </div>
                        <button onClick={() => setShowToast(false)} className="ml-6 hover:text-[var(--text-primary)]">
                            <X className="w-6 h-6" />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Floating Dock Navigation - Centered Bottom */}
            <div className="fixed bottom-10 left-0 right-0 flex justify-center z-50 pointer-events-none">
                <nav className="flex items-center gap-3 bg-[#161b22] border border-[#30363d] p-3 rounded-3xl shadow-2xl pointer-events-auto">
                    <DockItem
                        icon={<Brain className="w-6 h-6" />}
                        active={activeTab === 'live'}
                        onClick={() => setActiveTab('live')}
                        tooltip="Live Analysis"
                    />
                    <DockItem
                        icon={<Clock className="w-6 h-6" />}
                        active={activeTab === 'queue'}
                        onClick={() => setActiveTab('queue')}
                        tooltip="Approval Queue"
                        badge={queue.length}
                    />
                    <DockItem
                        icon={<BarChart2 className="w-6 h-6" />}
                        active={activeTab === 'analytics'}
                        onClick={() => setActiveTab('analytics')}
                        tooltip="System Analytics"
                    />
                    <DockItem
                        icon={<FileText className="w-6 h-6" />}
                        active={activeTab === 'history'}
                        onClick={() => setActiveTab('history')}
                        tooltip="History"
                    />
                </nav>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Metric Pill Component
// ---------------------------------------------------------------------------
function MetricPill({ label, value, size }) {
    return (
        <div className={`
            glass-panel rounded-full flex items-center gap-4 border border-[#30363d] bg-[#161b22]
            ${size === 'large' ? 'px-8 py-4' : 'px-5 py-3'}
        `}>
            <span className={`text-[#8b949e] uppercase tracking-[0.05em] font-medium ${size === 'large' ? 'text-sm' : 'text-xs'}`}>{label}</span>
            <span className={`font-bold text-white ${size === 'large' ? 'text-2xl' : 'text-lg'}`}>{value}</span>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Dock Item Component
// ---------------------------------------------------------------------------
function DockItem({ icon, active, onClick, tooltip, badge }) {
    return (
        <motion.button
            className={`
                relative p-4 rounded-2xl transition-colors duration-200 group
                ${active ? 'bg-[var(--accent-primary)] text-white' : 'text-[var(--text-secondary)] hover:bg-[rgba(255,255,255,0.08)]'}
            `}
            onClick={onClick}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            transition={buttonSpring}
        >
            {icon}
            {tooltip && (
                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 px-4 py-2 bg-black text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none">
                    {tooltip}
                </span>
            )}
            {badge > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center border-2 border-[#161b22]">
                    {badge}
                </span>
            )}
        </motion.button>
    );
}

// ---------------------------------------------------------------------------
// Live Analysis View with Card Grid
// ---------------------------------------------------------------------------
function LiveAnalysisView({ history, activeResult, setActiveResult, handleApproval }) {
    return (
        <>
            {/* Card Grid */}
            {history.length === 0 ? (
                <SkeletonGrid />
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 w-full">
                    <AnimatePresence mode="popLayout">
                        {history.map((session, index) => (
                            <TiltCard
                                key={session.session_id || session.id}
                                session={session}
                                onClick={() => setActiveResult(session)}
                                index={index}
                            />
                        ))}
                    </AnimatePresence>
                </div>
            )}

            {/* Expanded Card Overlay - CENTERED */}
            <AnimatePresence>
                {activeResult && (
                    <ExpandedSessionView
                        session={activeResult}
                        onClose={() => setActiveResult(null)}
                        handleApproval={handleApproval}
                    />
                )}
            </AnimatePresence>
        </>
    );
}

// ---------------------------------------------------------------------------
// Tilt Card Component with 3D Hover Effect
// ---------------------------------------------------------------------------
function TiltCard({ session, onClick, index }) {
    const cardRef = useRef(null);
    const [tilt, setTilt] = useState({ x: 0, y: 0 });

    const handleMouseMove = (e) => {
        if (!cardRef.current) return;
        const rect = cardRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        const rotateX = (y - centerY) / 20; // Reduced sensitivity
        const rotateY = (centerX - x) / 20;

        setTilt({ x: rotateX, y: rotateY });
    };

    const handleMouseLeave = () => {
        setTilt({ x: 0, y: 0 });
    };

    const isEmergency = session.is_emergency || session.abnormal_pattern || session.volume_spike;

    return (
        <motion.div
            ref={cardRef}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ delay: index * 0.05, ...springConfig }}
            onClick={onClick}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            style={{
                transform: `perspective(1000px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
                transformStyle: 'preserve-3d'
            }}
            className={`
                glass-card p-8 cursor-pointer relative overflow-hidden min-h-[240px] flex flex-col justify-between
                ${isEmergency ? 'border-l-8 border-l-[var(--accent-danger)]' : 'border-l-0'}
                hover:border-[var(--accent-primary)] border border-transparent transition-colors
            `}
            whileHover={{ scale: 1.02, zIndex: 10 }}
            whileTap={{ scale: 0.98 }}
        >
            {/* Shine overlay on hover */}
            <div
                className="absolute inset-0 pointer-events-none opacity-0 hover:opacity-100 transition-opacity z-0"
                style={{
                    background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.05) 45%, transparent 50%)'
                }}
            />

            <div className="relative z-10 w-full">
                <div className="flex justify-between items-start mb-4">
                    <span className="text-xl font-bold text-[var(--text-primary)] line-clamp-1 flex-1 mr-4">
                        {session.diagnosis?.root_cause?.replace(/_/g, ' ') || "Analyzing..."}
                    </span>
                    <RiskBadge level={session.risk} />
                </div>

                <p className="text-base text-[var(--text-secondary)] line-clamp-3 leading-relaxed mb-6">
                    {session.explanation?.substring(0, 150) || "Processing diagnostic logic..."}
                </p>
            </div>

            <div className="relative z-10 w-full flex items-center justify-between text-xs text-[var(--text-tertiary)] mt-auto pt-4 border-t border-[rgba(255,255,255,0.05)]">
                <span className="font-mono tracking-wider">
                    ID: {(session.session_id || session.id)?.substring(0, 8)}
                </span>
                <StatusBadge status={session.status} />
            </div>
        </motion.div>
    );
}

// ---------------------------------------------------------------------------
// Expanded Session View (Modal Overlay)
// ---------------------------------------------------------------------------
function ExpandedSessionView({ session, onClose, handleApproval }) {
    // Prevent scrolling on body when modal is open
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = 'unset'; };
    }, []);

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-8 sm:p-16">
            {/* Backdrop */}
            <motion.div
                className="absolute inset-0 bg-[#000000]/80 backdrop-blur-md"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
            />

            {/* Expanded Card */}
            <motion.div
                className="relative w-full max-w-5xl bg-[#161b22] border border-[#30363d] shadow-[0_0_100px_rgba(0,0,0,0.7)] rounded-3xl overflow-hidden flex flex-col max-h-[85vh]"
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={springConfig}
            >
                {/* Header */}
                <div className="bg-[#0d1117] p-8 border-b border-[#30363d] flex justify-between items-start shrink-0">
                    <div>
                        <div className="flex items-center gap-4 mb-3">
                            <h3 className="text-3xl font-bold text-white">Diagnostic Report</h3>
                            {session.diagnosis?.confidence && (
                                <span className="text-sm bg-[#1f6feb]/20 px-3 py-1 rounded-full text-[#58a6ff] font-mono border border-[#1f6feb]/40">
                                    {(session.diagnosis.confidence * 100).toFixed(0)}% Confidence
                                </span>
                            )}
                        </div>
                        <p className="text-base text-[#8b949e] font-mono">
                            SESSION_ID: <span className="text-[#c9d1d9]">{session.session_id || session.id}</span>
                        </p>
                    </div>
                    <motion.button
                        onClick={onClose}
                        className="p-3 rounded-xl bg-[#21262d] text-[#c9d1d9] hover:bg-[#30363d] hover:text-white transition-colors"
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.95 }}
                        transition={buttonSpring}
                    >
                        <X className="w-6 h-6" />
                    </motion.button>
                </div>

                {/* Scrollable Content */}
                <div className="p-8 space-y-8 overflow-y-auto">
                    {/* Analysis Grid */}
                    <div className="grid grid-cols-2 gap-8">
                        <div className="bg-[#0d1117] border border-[#30363d] p-6 rounded-2xl">
                            <div className="text-sm text-[#8b949e] uppercase tracking-wider mb-2 font-semibold">Root Cause</div>
                            <div className="text-xl font-medium text-[#c9d1d9]">
                                {session.diagnosis?.root_cause?.replace(/_/g, ' ') || "Pending"}
                            </div>
                        </div>
                        <div className="bg-[#0d1117] border border-[#30363d] p-6 rounded-2xl">
                            <div className="text-sm text-[#8b949e] uppercase tracking-wider mb-2 font-semibold">Risk Level</div>
                            <div className="flex items-center gap-3">
                                <div className={`w-3 h-3 rounded-full ${session.risk === 'high' ? 'bg-[#f85149]' : 'bg-[#3fb950]'}`} />
                                <span className="text-xl font-medium text-[#c9d1d9] capitalize">{session.risk || 'Low'}</span>
                            </div>
                        </div>
                    </div>

                    {/* AI Reasoning */}
                    <div className="rounded-2xl border border-[#30363d] overflow-hidden bg-[#0d1117]">
                        <div className="flex items-center justify-between px-6 py-3 border-b border-[#30363d] bg-[#161b22]">
                            <div className="flex items-center gap-3">
                                <div className="flex gap-1.5">
                                    <div className="w-3 h-3 rounded-full bg-[#fa7970]" />
                                    <div className="w-3 h-3 rounded-full bg-[#faa356]" />
                                    <div className="w-3 h-3 rounded-full bg-[#7ce38b]" />
                                </div>
                                <span className="ml-4 text-sm text-[#8b949e] font-mono">agent_reasoning.log</span>
                            </div>
                        </div>
                        <div className="p-6 text-[#c9d1d9] font-mono text-sm leading-relaxed whitespace-pre-wrap">
                            {session.explanation || "// Awaiting analysis..."}
                        </div>
                    </div>

                    {/* Proposed Solution */}
                    {session.recommended_action && (
                        <div className="rounded-2xl border border-[#2ea043] overflow-hidden bg-[rgba(46,160,67,0.05)]">
                            <div className="flex items-center gap-3 px-6 py-3 border-b border-[#2ea043]/30 bg-[rgba(46,160,67,0.1)]">
                                <CheckCircle className="w-5 h-5 text-[#3fb950]" />
                                <span className="text-sm text-[#3fb950] font-bold font-mono">PROPOSED_SOLUTION</span>
                            </div>
                            <div className="p-6 font-mono text-base text-[#e6edf3] whitespace-pre-wrap">
                                {(() => {
                                    try {
                                        const fixData = JSON.parse(session.recommended_action);
                                        return fixData.content || session.recommended_action;
                                    } catch {
                                        return session.recommended_action;
                                    }
                                })()}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer / Approval Actions */}
                {session.status === 'awaiting_approval' && (
                    <div className="p-8 border-t border-[#30363d] bg-[#161b22] flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-6">
                            <div className="p-4 bg-[rgba(210,153,34,0.15)] rounded-2xl text-[#d29922] animate-pulse">
                                <AlertTriangle className="w-8 h-8" />
                            </div>
                            <div>
                                <h4 className="text-xl font-bold text-white">Approval Required</h4>
                                <p className="text-[#8b949e]">Review the proposed solution above before proceeding.</p>
                            </div>
                        </div>
                        <div className="flex gap-4">
                            <ScaleButton
                                onClick={() => handleApproval(session.approval_id || session.session_id || session.id, true)}
                                variant="success"
                            >
                                <ThumbsUp className="w-5 h-5" /> Approve Fix
                            </ScaleButton>
                            <ScaleButton
                                onClick={() => handleApproval(session.approval_id || session.session_id || session.id, false)}
                                variant="danger"
                            >
                                <ThumbsDown className="w-5 h-5" /> Reject
                            </ScaleButton>
                        </div>
                    </div>
                )}
            </motion.div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Queue View
// ---------------------------------------------------------------------------
function QueueView({ queue, handleApproval }) {
    if (queue.length === 0) {
        return <EmptyState message="No actions pending approval" />;
    }

    return (
        <div className="grid grid-cols-1 gap-6 max-w-5xl mx-auto">
            {queue.map((item, index) => (
                <motion.div
                    key={item.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1, ...springConfig }}
                    className="glass-card p-8 border-l-8 border-[var(--accent-warning)] flex flex-col gap-6"
                >
                    <div className="flex justify-between items-start">
                        <div className="flex items-center gap-6">
                            <div className="p-4 bg-[rgba(210,153,34,0.15)] rounded-2xl text-[var(--accent-warning)]">
                                <AlertTriangle className="w-8 h-8" />
                            </div>
                            <div>
                                <h4 className="text-2xl font-bold text-[var(--text-primary)]">Pending Approval</h4>
                                <p className="text-sm text-[var(--text-secondary)] mt-1">{new Date(item.created_at).toLocaleString()}</p>
                            </div>
                        </div>
                    </div>

                    <div className="code-window">
                        <div className="code-window-header">
                            <span className="text-xs font-mono text-[var(--text-secondary)]">DRAFT_RESPONSE.md</span>
                        </div>
                        <div className="p-6 text-sm font-mono text-[var(--text-primary)] whitespace-pre-wrap leading-relaxed">
                            {item.proposed_action?.draft_content || JSON.stringify(item.proposed_action, null, 2)}
                        </div>
                    </div>

                    <div className="flex gap-4 border-t border-[rgba(255,255,255,0.05)] pt-6">
                        <ScaleButton onClick={() => handleApproval(item.id, true)} variant="success" fullWidth>
                            <ThumbsUp className="w-5 h-5" /> Approve Action
                        </ScaleButton>
                        <ScaleButton onClick={() => handleApproval(item.id, false)} variant="danger" fullWidth>
                            <ThumbsDown className="w-5 h-5" /> Reject Action
                        </ScaleButton>
                    </div>
                </motion.div>
            ))}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Analytics View (Restored Functionality)
// ---------------------------------------------------------------------------
function AnalyticsView({ analytics }) {
    if (!analytics) return <EmptyState message="Loading analytics..." />;

    const pieData = analytics.risk_profile ? Object.keys(analytics.risk_profile).map(k => ({
        name: k, value: analytics.risk_profile[k]
    })) : [];

    const barData = analytics.issue_distribution ? Object.keys(analytics.issue_distribution).map(k => ({
        name: k.replace(/_/g, ' '), count: analytics.issue_distribution[k]
    })) : [];

    const COLORS = ['#3fb950', '#d29922', '#f85149', '#58a6ff'];

    return (
        <div className="space-y-8 animate-enter pb-20">
            {/* Stat Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <MetricCard label="Total Tickets" value={analytics.total_tickets} delay={0} />
                <MetricCard label="Resolved" value={analytics.resolved_count} delay={0.1} />
                <MetricCard label="Success Rate" value={`${(analytics.success_rate * 100).toFixed(0)}%`} delay={0.2} />
                <MetricCard label="Avg. Confidence" value={`${(analytics.avg_confidence * 100).toFixed(0)}%`} delay={0.3} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Risk Distribution */}
                <div className="glass-card p-8">
                    <h3 className="text-2xl font-bold mb-8 text-[var(--text-primary)]">Risk Severity Profile</h3>
                    <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={pieData}
                                    cx="50%" cy="50%"
                                    innerRadius={80}
                                    outerRadius={100}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {pieData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#0d1117', borderColor: '#30363d', color: '#f0f6fc' }}
                                    itemStyle={{ color: '#f0f6fc' }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Issue Type Distribution */}
                <div className="glass-card p-8">
                    <h3 className="text-2xl font-bold mb-8 text-[var(--text-primary)]">Issue Distribution</h3>
                    <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={barData} layout="vertical" margin={{ left: 20 }}>
                                <XAxis type="number" hide />
                                <YAxis dataKey="name" type="category" width={140} tick={{ fill: '#8b949e', fontSize: 12 }} />
                                <Tooltip
                                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                    contentStyle={{ backgroundColor: '#0d1117', borderColor: '#30363d', color: '#f0f6fc' }}
                                />
                                <Bar dataKey="count" fill="#58a6ff" radius={[0, 6, 6, 0]} barSize={30} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </div>
    );
}

function MetricCard({ label, value, delay }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay, ...springConfig }}
            className="glass-card p-8"
        >
            <p className="text-sm text-[var(--text-secondary)] uppercase tracking-wider mb-3">{label}</p>
            <p className="text-4xl font-bold text-[var(--text-primary)]">{value}</p>
        </motion.div>
    );
}

// ---------------------------------------------------------------------------
// History View
// ---------------------------------------------------------------------------
function HistoryView({ history }) {
    return (
        <div className="space-y-4 max-w-5xl mx-auto pb-20">
            {history.map((session, index) => (
                <motion.div
                    key={session.session_id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05, ...springConfig }}
                    className="glass-card p-6 flex justify-between items-center hover:bg-[#21262d] transition-colors"
                >
                    <div className="flex items-center gap-6">
                        <StatusBadge status={session.status} large />
                        <div>
                            <h4 className="text-lg font-bold text-[var(--text-primary)] line-clamp-1 mb-1">
                                {session.diagnosis?.root_cause?.replace(/_/g, ' ') || "Unknown Issue"}
                            </h4>
                            <p className="text-xs text-[var(--text-secondary)] font-mono">
                                SESSION_ID: {session.session_id}
                            </p>
                        </div>
                    </div>
                    <div className="text-right text-sm text-[var(--text-secondary)]">
                        <div className="font-semibold">{new Date(session.started_at).toLocaleDateString()}</div>
                        <div className="font-mono text-xs">{new Date(session.started_at).toLocaleTimeString()}</div>
                    </div>
                </motion.div>
            ))}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------
// (DockItem and MetricPill are defined above)

function ScaleButton({ children, onClick, variant = 'default', fullWidth = false }) {
    const variants = {
        success: 'bg-[#238636] hover:bg-[#2ea043] text-white border border-[rgba(255,255,255,0.1)]',
        danger: 'bg-[#da3633] hover:bg-[#f85149] text-white border border-[rgba(255,255,255,0.1)]',
        default: 'glass-button'
    };

    return (
        <motion.button
            onClick={onClick}
            className={`px-6 py-3 rounded-xl font-bold text-base flex items-center justify-center gap-2 transition-all shadow-md ${variants[variant]} ${fullWidth ? 'flex-1' : ''}`}
            whileTap={{ scale: 0.97 }}
            transition={buttonSpring}
        >
            {children}
        </motion.button>
    );
}

function RiskBadge({ level }) {
    const colors = {
        low: 'bg-[#1a7f37]/20 text-[#3fb950] border-[#3fb950]/30',
        medium: 'bg-[#9a6700]/20 text-[#d29922] border-[#d29922]/30',
        high: 'bg-[#d1242f]/20 text-[#f85149] border-[#f85149]/30',
        critical: 'bg-[#d1242f]/30 text-[#ff7b72] border-[#ff7b72] animate-pulse'
    };

    return (
        <span className={`text-xs px-2.5 py-1 rounded-md uppercase font-bold tracking-wider border ${colors[level] || colors.low}`}>
            {level || 'Low'}
        </span>
    );
}

function StatusBadge({ status, large }) {
    const config = {
        dispatched: { color: '#3fb950', icon: CheckCircle, label: 'Dispatched' },
        completed: { color: '#3fb950', icon: CheckCircle, label: 'Completed' },
        awaiting_approval: { color: '#d29922', icon: Clock, label: 'Action Required' },
        analyzing: { color: '#58a6ff', icon: Brain, label: 'Analyzing' },
        failed: { color: '#f85149', icon: AlertTriangle, label: 'Failed' }
    };

    const type = config[status] || config.analyzing;
    const Icon = type.icon;

    return (
        <span className={`flex items-center gap-2 font-bold rounded-full border
            ${large ? 'px-4 py-1.5 text-sm bg-[rgba(255,255,255,0.03)]' : 'px-2 py-0.5 text-[10px] bg-transparent border-transparent'}
        `} style={{ color: type.color, borderColor: large ? 'rgba(255,255,255,0.1)' : 'transparent' }}>
            <Icon className={large ? "w-4 h-4" : "w-3 h-3"} />
            {type.label}
        </span>
    );
}

function SkeletonGrid() {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 w-full">
            {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="glass-card p-8 space-y-4 h-[240px] border border-[#30363d]">
                    <div className="flex justify-between">
                        <div className="h-6 w-32 bg-[#21262d] rounded animate-pulse" />
                        <div className="h-6 w-12 bg-[#21262d] rounded animate-pulse" />
                    </div>
                    <div className="h-4 w-full bg-[#21262d] rounded animate-pulse" />
                    <div className="h-4 w-3/4 bg-[#21262d] rounded animate-pulse" />
                    <div className="flex justify-between mt-auto pt-8">
                        <div className="h-4 w-20 bg-[#21262d] rounded animate-pulse" />
                        <div className="h-4 w-24 bg-[#21262d] rounded animate-pulse" />
                    </div>
                </div>
            ))}
        </div>
    );
}

function EmptyState({ message }) {
    return (
        <div className="min-h-[50vh] flex flex-col items-center justify-center text-center">
            <motion.div
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            >
                <Brain className="w-24 h-24 mb-6 text-[#30363d]" />
            </motion.div>
            <p className="text-xl text-[#8b949e] font-medium">{message}</p>
        </div>
    );
}
