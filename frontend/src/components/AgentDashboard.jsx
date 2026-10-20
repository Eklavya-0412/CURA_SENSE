import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Activity, AlertTriangle, CheckCircle2, Clock, FileText, Brain, X,
    ThumbsUp, ThumbsDown, RefreshCw, BarChart2, Bell, Database, Gauge,
    Layers, ShieldAlert, ExternalLink, Sparkles, Zap, Inbox, ArrowUpRight, MessageSquare, ScrollText, Search, Quote
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid } from 'recharts';
import { getAgentMetrics, getSessionHistory, getApprovalQueue, approveAction, getAnalytics, seedDemoData, getSession, getActivityFeed } from '../api/client';
import {
    BrandMark, RiskBadge, StatusBadge, ConfidenceMeter, WorkflowStepper, SectionLabel, EmptyState,
    MerchantTag, ActivityLog
} from './ui';
import { humanize, formatPercent, formatDateTime, sourceLabel, RISK_COLORS } from '../lib/format';
import ChatInterface from './ChatInterface';

// Mirrors backend /agent/metrics: anything not completed, dispatched or failed is still in the workflow.
const FINISHED_STATUSES = ['completed', 'dispatched', 'failed'];
const INCIDENT_FILTERS = {
    all: { label: 'All', test: () => true },
    active: { label: 'Active', test: (s) => !FINISHED_STATUSES.includes(s.status) },
    approval: { label: 'Needs approval', test: (s) => s.status === 'awaiting_approval' },
};

const NAV_ITEMS = [
    { key: 'live', label: 'Live incidents', icon: Brain },
    { key: 'queue', label: 'Approval queue', icon: Clock },
    { key: 'analytics', label: 'Analytics', icon: BarChart2 },
    { key: 'history', label: 'Session history', icon: FileText },
    { key: 'activity', label: 'Activity log', icon: ScrollText },
    { key: 'assistant', label: 'AI assistant', icon: MessageSquare },
];

const PAGE_COPY = {
    live: { title: 'Live incidents', subtitle: 'AI-diagnosed incidents with root cause, risk and proposed fixes.' },
    queue: { title: 'Approval queue', subtitle: 'High-risk or low-confidence fixes waiting for a human decision.' },
    analytics: { title: 'Analytics', subtitle: 'Resolution performance and incident distribution across sessions.' },
    history: { title: 'Session history', subtitle: 'Audit log of every agent session and its outcome.' },
    activity: { title: 'Activity log', subtitle: 'Every step the agent took, across all merchants, as it happened.' },
    assistant: { title: 'AI assistant', subtitle: 'RAG troubleshooting assistant grounded in the migration knowledge base.' },
};

export default function AgentDashboard() {
    const [activeTab, setActiveTab] = useState('live');
    const [incidentFilter, setIncidentFilter] = useState('all');
    const incidentsRef = useRef(null);
    const [metrics, setMetrics] = useState(null);
    const [history, setHistory] = useState([]);
    const [queue, setQueue] = useState([]);
    const [analytics, setAnalytics] = useState(null);
    const [activeResult, setActiveResult] = useState(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isSeeding, setIsSeeding] = useState(false);
    const [showToast, setShowToast] = useState(false);
    const [hasLoaded, setHasLoaded] = useState(false);
    const [lastSynced, setLastSynced] = useState(null);
    const [activity, setActivity] = useState({ entries: [], total: 0 });
    const prevTotalSessions = useRef(null);
    const openSessionId = useRef(null);

    // -------------------------------------------------------------------------
    // BACKEND LOGIC
    // -------------------------------------------------------------------------
    useEffect(() => {
        refreshData();
        const interval = setInterval(refreshData, 10000);
        return () => clearInterval(interval);
    }, []);

    const handleSeedDemo = async () => {
        setIsSeeding(true);
        try {
            await seedDemoData();
            await refreshData();
        } catch (error) {
            console.error("Failed to seed demo data:", error);
        } finally {
            setIsSeeding(false);
        }
    };

    const refreshData = async () => {
        setIsRefreshing(true);
        try {
            const [m, h, q, a, feed] = await Promise.all([
                getAgentMetrics(),
                getSessionHistory(50),
                getApprovalQueue(),
                getAnalytics(),
                getActivityFeed(200).catch(() => null)
            ]);
            setMetrics(m);
            setHistory(h.sessions || []);
            setQueue(q.items || []);
            setAnalytics(a);
            if (feed) setActivity(feed);
            setLastSynced(new Date());

            // Check for new tickets. Uses the server-side total, since the history list is capped.
            const currentCount = m?.total_sessions ?? 0;
            if (prevTotalSessions.current !== null && currentCount > prevTotalSessions.current) {
                setShowToast(true);
                setTimeout(() => setShowToast(false), 5000);
            }
            prevTotalSessions.current = currentCount;

            // Keep an open incident report live (status, log, evidence)
            if (openSessionId.current) {
                const fresh = await getSession(openSessionId.current).catch(() => null);
                if (fresh && fresh.session_id === openSessionId.current) setActiveResult(fresh);
            }

        } catch (error) {
            console.error("Failed to fetch data:", error);
        }
        setHasLoaded(true);
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

    const page = PAGE_COPY[activeTab];

    // Open an incident report: show what we have immediately, then load the full session
    const openSession = async (sessionOrId) => {
        const id = typeof sessionOrId === 'string' ? sessionOrId : (sessionOrId.session_id || sessionOrId.id);
        openSessionId.current = id;
        const known = typeof sessionOrId === 'string' ? history.find((s) => s.session_id === id) : sessionOrId;
        if (known) setActiveResult(known);
        const fresh = await getSession(id).catch(() => null);
        if (fresh && openSessionId.current === id) setActiveResult(fresh);
    };

    const closeSession = () => {
        openSessionId.current = null;
        setActiveResult(null);
    };

    // KPI tiles deep-link into the matching workspace view
    const goTo = (tab, filter) => {
        setActiveTab(tab);
        if (tab === 'live') {
            setIncidentFilter(filter || 'all');
            requestAnimationFrame(() => incidentsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
        } else {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    return (
        <div className="min-h-screen bg-canvas text-fg lg:pl-60">
            {/* Sidebar (desktop) */}
            <aside className="hidden lg:flex fixed inset-y-0 left-0 z-30 w-60 flex-col border-r border-line bg-surface">
                <div className="h-16 flex items-center px-4 border-b border-line">
                    <BrandMark subtitle="Operations console" />
                </div>
                <nav className="flex-1 px-3 py-4 space-y-0.5" aria-label="Primary">
                    <div className="t-overline px-2.5 pb-2">Workspace</div>
                    {NAV_ITEMS.map(({ key, label, icon: Icon }) => (
                        <button
                            key={key}
                            className="nav-item"
                            aria-current={activeTab === key ? 'page' : undefined}
                            onClick={() => setActiveTab(key)}
                        >
                            <Icon />
                            <span>{label}</span>
                            {key === 'queue' && queue.length > 0 && <span className="nav-count">{queue.length}</span>}
                        </button>
                    ))}
                    <div className="t-overline px-2.5 pt-5 pb-2">Portals</div>
                    <a href="/merchant.html" className="nav-item">
                        <ExternalLink />
                        <span>Merchant portal</span>
                    </a>
                </nav>
                <div className="p-3 border-t border-line">
                    <div className="rounded-lg bg-surface-2 border border-line px-3 py-2.5">
                        <div className="flex items-center gap-2 text-xs font-medium text-fg">
                            <span className="relative flex w-2 h-2">
                                <span className="absolute inset-0 rounded-full bg-success opacity-60 animate-ping" />
                                <span className="relative w-2 h-2 rounded-full bg-success" />
                            </span>
                            Agent online
                        </div>
                        <div className="t-meta mt-1">
                            {lastSynced ? `Synced ${lastSynced.toLocaleTimeString()}` : 'Connecting…'}
                        </div>
                    </div>
                </div>
            </aside>

            {/* Top bar (mobile / tablet) */}
            <div className="lg:hidden sticky top-0 z-30 bg-surface/95 backdrop-blur border-b border-line">
                <div className="h-14 flex items-center justify-between px-4">
                    <BrandMark subtitle="Operations console" />
                    <a href="/merchant.html" className="btn btn-ghost btn-sm">Merchant portal</a>
                </div>
                <nav className="no-scrollbar flex gap-1 px-3 pb-2 overflow-x-auto" aria-label="Primary">
                    {NAV_ITEMS.map(({ key, label, icon: Icon }) => (
                        <button
                            key={key}
                            className="nav-item w-auto shrink-0"
                            aria-current={activeTab === key ? 'page' : undefined}
                            onClick={() => setActiveTab(key)}
                        >
                            <Icon />
                            <span>{label}</span>
                            {key === 'queue' && queue.length > 0 && <span className="nav-count">{queue.length}</span>}
                        </button>
                    ))}
                </nav>
            </div>

            {/* Page header */}
            <header className="border-b border-line bg-canvas">
                <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                        <h1 className="t-h1">{page.title}</h1>
                        <p className="t-body mt-0.5">{page.subtitle}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <button onClick={handleSeedDemo} disabled={isSeeding} className="btn btn-secondary">
                            <Database className={isSeeding ? 'animate-pulse' : ''} />
                            {isSeeding ? 'Loading…' : 'Load demo tickets'}
                        </button>
                        <button onClick={refreshData} className="btn btn-primary" disabled={isRefreshing && !hasLoaded}>
                            <RefreshCw className={isRefreshing ? 'animate-spin' : ''} />
                            Sync data
                        </button>
                    </div>
                </div>
            </header>

            {/* Main content */}
            <main className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-16">
                {activeTab === 'live' && (
                    <>
                        <KpiStrip metrics={metrics} queue={queue} onNavigate={goTo} />
                        <LiveAnalysisView
                            history={history}
                            hasLoaded={hasLoaded}
                            filter={incidentFilter}
                            setFilter={setIncidentFilter}
                            sectionRef={incidentsRef}
                            setActiveResult={openSession}
                            handleSeedDemo={handleSeedDemo}
                            isSeeding={isSeeding}
                        />
                    </>
                )}

                {activeTab === 'queue' && (
                    <QueueView queue={queue} handleApproval={handleApproval} onOpen={openSession} />
                )}

                {activeTab === 'analytics' && (
                    <AnalyticsView analytics={analytics} onNavigate={goTo} />
                )}

                {activeTab === 'history' && (
                    <HistoryView history={history} onOpen={openSession} />
                )}

                {activeTab === 'activity' && (
                    <ActivityView feed={activity} onOpen={openSession} />
                )}

                {activeTab === 'assistant' && (
                    <ChatInterface embedded />
                )}
            </main>

            {/* Session detail modal (opened from Live incidents or History) */}
            <AnimatePresence>
                {activeResult && (
                    <ExpandedSessionView
                        session={activeResult}
                        onClose={closeSession}
                        handleApproval={handleApproval}
                    />
                )}
            </AnimatePresence>

            {/* New ticket toast */}
            <AnimatePresence>
                {showToast && (
                    <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.18 }}
                        className="fixed top-4 right-4 z-[110] card w-[min(22rem,calc(100vw-2rem))] p-3.5 flex items-start gap-3 shadow-[var(--shadow-lg)]"
                        role="status"
                    >
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-accent/15 text-accent shrink-0">
                            <Bell className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="t-h3">New ticket detected</div>
                            <p className="t-meta mt-0.5">The agent is analyzing the incoming issue.</p>
                        </div>
                        <button onClick={() => setShowToast(false)} className="btn btn-ghost btn-icon btn-sm -mr-1 -mt-1" aria-label="Dismiss">
                            <X />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// ---------------------------------------------------------------------------
// KPI strip
// ---------------------------------------------------------------------------
function KpiStrip({ metrics, queue, onNavigate }) {
    const tiles = [
        { label: 'Success rate', value: metrics ? formatPercent(metrics.success_rate) : null, hint: 'Resolved without rollback', icon: Gauge, onClick: () => onNavigate('analytics'), action: 'View analytics' },
        { label: 'Total sessions', value: metrics?.total_sessions, hint: 'Agent runs to date', icon: Layers, onClick: () => onNavigate('history'), action: 'View session history' },
        { label: 'Active sessions', value: metrics?.active_sessions, hint: 'Currently in workflow', icon: Activity, onClick: () => onNavigate('live', 'active'), action: 'Show active incidents' },
        { label: 'Pending approvals', value: metrics ? queue.length : null, hint: 'Awaiting human review', icon: ShieldAlert, tone: queue.length > 0 ? 'warning' : null, onClick: () => onNavigate('queue'), action: 'Open approval queue' },
    ];

    return (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-6">
            {tiles.map((t) => <KpiTile key={t.label} {...t} />)}
        </div>
    );
}

function KpiTile({ label, value, hint, icon: Icon, tone, onClick, action }) {
    const Wrapper = onClick ? 'button' : 'div';
    const interactiveProps = onClick
        ? { type: 'button', onClick, title: action, 'aria-label': `${label}: ${value ?? 'loading'}. ${action}` }
        : {};
    return (
        <Wrapper
            {...interactiveProps}
            className={`card px-4 py-3.5 text-left w-full ${onClick ? 'card-interactive group' : ''}`}
        >
            <div className="flex items-center justify-between gap-2">
                <span className="t-overline sm:truncate">{label}</span>
                {Icon && (
                    <span className="hidden sm:block relative w-4 h-4 shrink-0">
                        <Icon className={`absolute inset-0 w-4 h-4 transition-opacity ${onClick ? 'group-hover:opacity-0 group-focus-visible:opacity-0' : ''} ${tone === 'warning' ? 'text-warning' : 'text-fg-subtle'}`} />
                        {onClick && <ArrowUpRight className="absolute inset-0 w-4 h-4 text-accent opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />}
                    </span>
                )}
            </div>
            {value === null || value === undefined ? (
                <div className="skeleton h-7 w-16 mt-2" />
            ) : (
                <div className={`text-2xl leading-8 font-semibold t-num mt-1.5 ${tone === 'warning' ? 'text-warning' : 'text-fg'}`}>{value}</div>
            )}
            {hint && <div className="t-meta mt-0.5 sm:truncate">{hint}</div>}
        </Wrapper>
    );
}

// ---------------------------------------------------------------------------
// Live Analysis View with Card Grid
// ---------------------------------------------------------------------------
function LiveAnalysisView({ history, hasLoaded, filter, setFilter, sectionRef, setActiveResult, handleSeedDemo, isSeeding }) {
    if (!hasLoaded) return <SkeletonGrid />;

    if (history.length === 0) {
        return (
            <EmptyState
                icon={Activity}
                title="No active incidents"
                description="The agent is listening for incoming tickets and monitoring webhooks. Load the demo set to populate the console with six sample incidents."
            >
                <button onClick={handleSeedDemo} disabled={isSeeding} className="btn btn-primary">
                    <Database />
                    {isSeeding ? 'Loading tickets…' : 'Load demo tickets'}
                </button>
                <a href="/merchant.html" className="btn btn-secondary">
                    Open merchant portal
                    <ExternalLink />
                </a>
            </EmptyState>
        );
    }

    const activeFilter = INCIDENT_FILTERS[filter] || INCIDENT_FILTERS.all;
    const visible = history.filter(activeFilter.test);

    return (
        <>
            <div ref={sectionRef} className="scroll-mt-28 flex flex-wrap items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                    <h2 className="t-h2">Incidents</h2>
                    <span className="badge badge-neutral t-num">{visible.length}</span>
                </div>
                <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-surface border border-line" role="tablist" aria-label="Filter incidents">
                    {Object.entries(INCIDENT_FILTERS).map(([key, f]) => {
                        const count = history.filter(f.test).length;
                        const selected = filter === key;
                        return (
                            <button
                                key={key}
                                role="tab"
                                aria-selected={selected}
                                onClick={() => setFilter(key)}
                                className={`h-7 px-2.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors ${selected ? 'bg-surface-3 text-fg shadow-[inset_0_0_0_1px_var(--color-line-strong)]' : 'text-fg-muted hover:text-fg'}`}
                            >
                                {f.label}
                                <span className={`t-num ${selected ? 'text-fg-muted' : 'text-fg-subtle'}`}>{count}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {visible.length === 0 && (
                <EmptyState
                    icon={CheckCircle2}
                    title={`No ${activeFilter.label.toLowerCase()} incidents`}
                    description="Nothing in this view right now."
                >
                    <button onClick={() => setFilter('all')} className="btn btn-secondary btn-sm">Show all incidents</button>
                </EmptyState>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {visible.map((session, index) => (
                    <IncidentCard
                        key={session.session_id || session.id}
                        session={session}
                        onClick={() => setActiveResult(session)}
                        index={index}
                    />
                ))}
            </div>

        </>
    );
}

// ---------------------------------------------------------------------------
// Incident card
// ---------------------------------------------------------------------------
function IncidentCard({ session, onClick, index }) {
    const isEmergency = session.is_emergency || session.abnormal_pattern || session.volume_spike;
    const sessionId = session.session_id || session.id;

    return (
        <button
            type="button"
            onClick={onClick}
            className="card card-interactive animate-enter relative overflow-hidden text-left p-4 flex flex-col h-full min-h-[204px]"
            style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
        >
            {isEmergency && <span className="absolute left-0 inset-y-0 w-[3px] bg-danger" aria-hidden />}

            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 min-w-0">
                    <RiskBadge level={session.risk} />
                    {session.is_systemic && <span className="badge badge-neutral">Systemic</span>}
                    {isEmergency && (
                        <span className="badge badge-danger">
                            <Zap />
                            Spike
                        </span>
                    )}
                </div>
                <span className="t-mono text-fg-subtle truncate">{sessionId}</span>
            </div>

            <h3 className="t-h3 mt-3 line-clamp-1">
                {humanize(session.diagnosis?.root_cause, 'Analyzing…')}
            </h3>
            <p className="t-body text-[13px] leading-5 mt-1 line-clamp-3">
                {session.client_message || session.explanation || 'Processing diagnostic logic…'}
            </p>

            <MerchantTag merchantId={session.merchant_id} source={session.source} className="mt-3" />

            <div className="mt-auto pt-3">
                <div className="flex items-center justify-between gap-3 pt-3 border-t border-line">
                    <StatusBadge status={session.status} />
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="t-meta hidden 2xl:inline">Confidence</span>
                        <ConfidenceMeter value={session.diagnosis?.confidence} className="w-24 shrink-0" />
                    </div>
                </div>
            </div>
        </button>
    );
}

// ---------------------------------------------------------------------------
// Expanded Session View (Modal)
// ---------------------------------------------------------------------------
function parseFix(raw) {
    if (!raw) return null;
    try {
        const fixData = JSON.parse(raw);
        return fixData.content || raw;
    } catch {
        return raw;
    }
}

function ExpandedSessionView({ session, onClose, handleApproval }) {
    // Prevent scrolling on body when modal is open; close on Escape
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => {
            document.body.style.overflow = 'unset';
            window.removeEventListener('keydown', onKey);
        };
    }, [onClose]);

    const sessionId = session.session_id || session.id;
    const approvalId = session.approval_id || session.session_id || session.id;
    const fix = parseFix(session.recommended_action);
    const confidence = session.diagnosis?.confidence;

    return (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:p-6" role="dialog" aria-modal="true" aria-label="Incident report">
            <motion.div
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                onClick={onClose}
            />

            <motion.div
                className="relative w-full sm:max-w-3xl bg-surface border border-line-strong rounded-t-2xl sm:rounded-2xl shadow-[var(--shadow-lg)] overflow-hidden flex flex-col max-h-[92vh] sm:max-h-[88vh]"
                initial={{ opacity: 0, y: 12, scale: 0.99 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.99 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            >
                {/* Header */}
                <div className="px-5 sm:px-6 py-4 border-b border-line flex items-start justify-between gap-4 shrink-0">
                    <div className="min-w-0">
                        <div className="t-overline">Incident report</div>
                        <h2 className="t-h1 mt-0.5 truncate">{humanize(session.diagnosis?.root_cause, 'Pending diagnosis')}</h2>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-2">
                            <StatusBadge status={session.status} />
                            <RiskBadge level={session.risk} />
                            <span className="t-mono text-fg-subtle">{sessionId}</span>
                            {session.started_at && <span className="t-meta">{formatDateTime(session.started_at)}</span>}
                        </div>
                        <MerchantTag merchantId={session.merchant_id} source={session.source} className="mt-2" />
                    </div>
                    <button onClick={onClose} className="btn btn-ghost btn-icon shrink-0 -mr-2" aria-label="Close">
                        <X />
                    </button>
                </div>

                {/* Body */}
                <div className="px-5 sm:px-6 py-5 space-y-5 overflow-y-auto">
                    {/* Reporter + original ticket */}
                    <section>
                        <SectionLabel>Reported by</SectionLabel>
                        <div className="well overflow-hidden">
                            <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-line">
                                <ReporterCell label="Merchant"><span className="t-mono text-fg">{session.merchant_id || 'unknown'}</span></ReporterCell>
                                <ReporterCell label="Channel">{sourceLabel(session.source)}</ReporterCell>
                                <ReporterCell label="Received">{formatDateTime(session.started_at)}</ReporterCell>
                            </div>
                            {session.client_message && (
                                <div className="border-t border-line px-3.5 py-3 flex gap-2.5">
                                    <Quote className="w-3.5 h-3.5 mt-1 shrink-0 text-fg-subtle" />
                                    <p className="text-[13px] leading-5 text-fg whitespace-pre-wrap break-words">{session.client_message}</p>
                                </div>
                            )}
                        </div>
                    </section>

                    {/* Workflow */}
                    <section>
                        <SectionLabel>Agent workflow</SectionLabel>
                        <div className="well no-scrollbar px-4 pt-3.5 pb-3 overflow-x-auto">
                            <div className="min-w-[600px] sm:min-w-0">
                                <WorkflowStepper status={session.status} requiresApproval={session.requires_approval} />
                            </div>
                        </div>
                    </section>

                    {/* Assessment summary */}
                    <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <SummaryCell label="Root cause">
                            <span className="text-sm font-medium text-fg">{humanize(session.diagnosis?.root_cause, 'Pending')}</span>
                        </SummaryCell>
                        <SummaryCell label="Risk assessment">
                            <span className="flex items-center gap-2 text-sm font-medium text-fg">
                                <span className="w-2 h-2 rounded-full" style={{ background: RISK_COLORS[session.risk] || RISK_COLORS.low }} />
                                {humanize(session.risk, 'Low')}
                                {session.is_systemic && <span className="t-meta font-normal">· systemic</span>}
                            </span>
                        </SummaryCell>
                        <SummaryCell label="Diagnosis confidence">
                            <ConfidenceMeter value={confidence} className="mt-1" />
                        </SummaryCell>
                    </section>

                    {/* Reasoning */}
                    <section>
                        <SectionLabel>Diagnostic reasoning</SectionLabel>
                        <div className="code-block">
                            <div className="code-block-header">
                                <span className="flex items-center gap-2"><Brain className="w-3.5 h-3.5" />agent_reasoning.log</span>
                            </div>
                            <div className="code-block-body">{session.explanation || '// Awaiting analysis…'}</div>
                        </div>
                    </section>

                    {/* Proposed fix */}
                    {fix && (
                        <section>
                            <SectionLabel>Proposed fix</SectionLabel>
                            <div className="rounded-lg border border-success/30 bg-success/[0.04] overflow-hidden">
                                <div className="flex items-center justify-between gap-2 h-[34px] px-3 border-b border-success/20 bg-success/[0.07]">
                                    <span className="flex items-center gap-2 text-xs font-medium text-success">
                                        <Sparkles className="w-3.5 h-3.5" />
                                        Recommended action
                                    </span>
                                    {session.action_type && <span className="t-mono text-fg-subtle">{session.action_type}</span>}
                                </div>
                                <div className="code-block-body text-fg">{fix}</div>
                            </div>
                        </section>
                    )}

                    {/* Retrieved evidence */}
                    {session.evidence?.length > 0 && (
                        <section>
                            <SectionLabel>Retrieved evidence</SectionLabel>
                            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {session.evidence.map((ev, i) => (
                                    <li key={i} className="well px-3 py-2.5 min-w-0">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="t-mono text-fg-muted truncate">{ev.source}</span>
                                            {ev.score > 0 && <span className="t-mono text-fg-subtle t-num shrink-0">{ev.score.toFixed(2)}</span>}
                                        </div>
                                        <p className="t-meta mt-1 line-clamp-3 break-words">{ev.snippet}</p>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}

                    {/* Activity log */}
                    <section>
                        <div className="flex items-center justify-between mb-2">
                            <div className="t-overline">Activity log</div>
                            {session.activity_log?.length > 0 && <span className="t-meta t-num">{session.activity_log.length} events</span>}
                        </div>
                        <div className="code-block">
                            <div className="code-block-header">
                                <span className="flex items-center gap-2"><ScrollText className="w-3.5 h-3.5" />session_{sessionId}.log</span>
                                <span>time · stage · event · duration</span>
                            </div>
                            <div className="max-h-72 overflow-y-auto">
                                <ActivityLog
                                    entries={session.activity_log}
                                    emptyText={session.activity_log ? 'No activity recorded yet.' : 'Loading activity…'}
                                />
                            </div>
                        </div>
                        {(session.error || session.rejection_reason) && (
                            <p className="t-meta mt-2 text-[#ff8a8a]">{session.error || `Rejected: ${session.rejection_reason}`}</p>
                        )}
                    </section>
                </div>

                {/* Approval footer */}
                {session.status === 'awaiting_approval' && (
                    <div className="px-5 sm:px-6 py-4 border-t border-line bg-surface-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
                        <div className="flex items-start gap-3 min-w-0">
                            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-warning/15 text-warning shrink-0">
                                <AlertTriangle className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                                <div className="t-h3">Human approval required</div>
                                <p className="t-meta mt-0.5">Review the reasoning and proposed fix before it is dispatched.</p>
                            </div>
                        </div>
                        <div className="flex gap-2 shrink-0">
                            <button onClick={() => handleApproval(approvalId, false)} className="btn btn-danger-outline flex-1 sm:flex-none">
                                <ThumbsDown /> Reject
                            </button>
                            <button onClick={() => handleApproval(approvalId, true)} className="btn btn-success flex-1 sm:flex-none">
                                <ThumbsUp /> Approve fix
                            </button>
                        </div>
                    </div>
                )}
            </motion.div>
        </div>
    );
}

function ReporterCell({ label, children }) {
    return (
        <div className="px-3.5 py-2.5 min-w-0">
            <div className="t-overline mb-0.5">{label}</div>
            <div className="text-[13px] leading-5 font-medium text-fg truncate">{children}</div>
        </div>
    );
}

function SummaryCell({ label, children }) {
    return (
        <div className="well px-3.5 py-3">
            <div className="t-overline mb-1.5">{label}</div>
            {children}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Queue View
// ---------------------------------------------------------------------------
function QueueView({ queue, handleApproval, onOpen }) {
    if (queue.length === 0) {
        return (
            <EmptyState
                icon={CheckCircle2}
                title="Queue is clear"
                description="No proposed fixes are waiting for approval. High-risk or low-confidence actions will appear here."
            />
        );
    }

    return (
        <div className="max-w-4xl space-y-3">
            {queue.map((item, index) => {
                const risk = item.risk || item.risk_assessment?.risk_level;
                return (
                    <article
                        key={item.id}
                        className="card overflow-hidden animate-enter"
                        style={{ animationDelay: `${index * 40}ms` }}
                    >
                        <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-4">
                            <div className="flex items-start gap-3 min-w-0">
                                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-warning/15 text-warning shrink-0 mt-0.5">
                                    <ShieldAlert className="w-4 h-4" />
                                </div>
                                <div className="min-w-0">
                                    <button onClick={() => onOpen(item.session_id)} className="t-h3 truncate hover:text-accent transition-colors text-left">
                                        {humanize(item.diagnosis?.root_cause, 'Pending approval')}
                                    </button>
                                    <MerchantTag merchantId={item.merchant_id} source={item.source} className="mt-1 flex" />
                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 t-meta">
                                        {item.session_id && <span className="t-mono">{item.session_id}</span>}
                                        <span aria-hidden>·</span>
                                        <span>{formatDateTime(item.created_at)}</span>
                                        {item.proposed_action?.type && (
                                            <>
                                                <span aria-hidden>·</span>
                                                <span>{humanize(item.proposed_action.type)}</span>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                {item.diagnosis?.confidence !== undefined && (
                                    <span className="badge badge-neutral t-num hidden sm:inline-flex">{formatPercent(item.diagnosis.confidence)} conf.</span>
                                )}
                                {risk && <RiskBadge level={risk} />}
                            </div>
                        </div>

                        <div className="px-5 pb-4 space-y-3">
                            {item.explanation && <p className="t-body">{item.explanation}</p>}
                            <div className="code-block">
                                <div className="code-block-header">
                                    <span>draft_response.md</span>
                                    {item.proposed_action?.target && <span>target: {item.proposed_action.target}</span>}
                                </div>
                                <div className="code-block-body">
                                    {item.proposed_action?.draft_content || JSON.stringify(item.proposed_action, null, 2)}
                                </div>
                            </div>
                        </div>

                        <div className="px-5 py-3 border-t border-line bg-surface-2/60 flex justify-end gap-2">
                            <button onClick={() => handleApproval(item.id, false)} className="btn btn-danger-outline btn-sm">
                                <ThumbsDown /> Reject
                            </button>
                            <button onClick={() => handleApproval(item.id, true)} className="btn btn-success btn-sm">
                                <ThumbsUp /> Approve action
                            </button>
                        </div>
                    </article>
                );
            })}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Analytics View
// ---------------------------------------------------------------------------
const tooltipStyle = {
    contentStyle: {
        backgroundColor: '#151920',
        border: '1px solid #2d3440',
        borderRadius: 8,
        color: '#e6e9ef',
        fontSize: 12,
        padding: '6px 10px',
    },
    itemStyle: { color: '#e6e9ef' },
    labelStyle: { color: '#9ba3b1', marginBottom: 2 },
};

function AnalyticsView({ analytics, onNavigate }) {
    if (!analytics) {
        return (
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                {[0, 1, 2, 3].map((i) => <div key={i} className="card h-[92px] skeleton" />)}
            </div>
        );
    }

    const pieData = analytics.risk_profile ? Object.keys(analytics.risk_profile).map(k => ({
        name: k, value: analytics.risk_profile[k]
    })) : [];
    const pieTotal = pieData.reduce((sum, d) => sum + d.value, 0);

    const barData = analytics.issue_distribution ? Object.keys(analytics.issue_distribution).map(k => ({
        name: k.replace(/_/g, ' '), count: analytics.issue_distribution[k]
    })) : [];

    return (
        <div className="space-y-4 animate-enter">
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                <KpiTile label="Total tickets" value={analytics.total_tickets} hint="Ingested across all channels" icon={Inbox} onClick={() => onNavigate('history')} action="View session history" />
                <KpiTile label="Resolved" value={analytics.resolved_count} hint="Completed or dispatched" icon={CheckCircle2} onClick={() => onNavigate('history')} action="View session history" />
                <KpiTile label="Success rate" value={formatPercent(analytics.success_rate)} hint="Resolved / total" icon={Gauge} />
                <KpiTile label="Avg. confidence" value={formatPercent(analytics.avg_confidence)} hint="Mean diagnosis confidence" icon={Brain} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                {/* Risk distribution */}
                <section className="card lg:col-span-2">
                    <div className="card-header">
                        <h3 className="t-h2">Risk severity profile</h3>
                        <span className="t-meta t-num">{pieTotal} sessions</span>
                    </div>
                    <div className="p-5 flex flex-col sm:flex-row lg:flex-col xl:flex-row items-center gap-6">
                        <div className="relative w-44 h-44 shrink-0">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={58} outerRadius={80} paddingAngle={pieTotal ? 3 : 0} dataKey="value" stroke="none" isAnimationActive={false}>
                                        {pieData.map((entry) => (
                                            <Cell key={entry.name} fill={RISK_COLORS[entry.name] || '#4c8dff'} />
                                        ))}
                                    </Pie>
                                    <Tooltip {...tooltipStyle} />
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                <span className="text-2xl font-semibold t-num leading-none">{pieTotal}</span>
                                <span className="t-meta mt-1">total</span>
                            </div>
                        </div>
                        <ul className="w-full space-y-2">
                            {pieData.map((d) => (
                                <li key={d.name} className="flex items-center gap-3 text-[13px]">
                                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: RISK_COLORS[d.name] || '#4c8dff' }} />
                                    <span className="text-fg-muted flex-1">{humanize(d.name)}</span>
                                    <span className="font-medium t-num text-fg">{d.value}</span>
                                    <span className="t-meta t-num w-10 text-right">{pieTotal ? Math.round((d.value / pieTotal) * 100) : 0}%</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </section>

                {/* Issue type distribution */}
                <section className="card lg:col-span-3">
                    <div className="card-header">
                        <h3 className="t-h2">Issue distribution by root cause</h3>
                        <span className="t-meta">Sessions per category</span>
                    </div>
                    <div className="p-5 h-[260px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={barData} layout="vertical" margin={{ left: 0, right: 16, top: 4, bottom: 4 }}>
                                <CartesianGrid horizontal={false} stroke="#222832" />
                                <XAxis type="number" allowDecimals={false} tick={{ fill: '#677080', fontSize: 11 }} axisLine={false} tickLine={false} />
                                <YAxis dataKey="name" type="category" width={190} tick={{ fill: '#9ba3b1', fontSize: 12 }} axisLine={false} tickLine={false} />
                                <Tooltip cursor={{ fill: 'rgba(255,255,255,0.03)' }} {...tooltipStyle} />
                                <Bar dataKey="count" name="Sessions" fill="#4c8dff" radius={[0, 4, 4, 0]} barSize={18} isAnimationActive={false} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </section>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// History View
// ---------------------------------------------------------------------------
function HistoryView({ history, onOpen }) {
    if (history.length === 0) {
        return <EmptyState icon={FileText} title="No sessions yet" description="Completed and in-flight agent sessions will be listed here." />;
    }

    return (
        <div className="card overflow-hidden animate-enter">
            <div className="overflow-x-auto">
                <table className="table min-w-[880px]">
                    <thead>
                        <tr>
                            <th>Incident</th>
                            <th>Merchant</th>
                            <th>Risk</th>
                            <th>Confidence</th>
                            <th>Status</th>
                            <th>Session</th>
                            <th className="text-right">Started</th>
                        </tr>
                    </thead>
                    <tbody>
                        {history.map((session) => (
                            <tr key={session.session_id} className="cursor-pointer" onClick={() => onOpen(session)}>
                                <td className="max-w-[340px]">
                                    <div className="font-medium text-fg truncate">{humanize(session.diagnosis?.root_cause, 'Unknown issue')}</div>
                                    <div className="t-meta truncate mt-0.5">{session.client_message || session.explanation}</div>
                                </td>
                                <td>
                                    <div className="t-mono text-fg-muted whitespace-nowrap">{session.merchant_id || 'unknown'}</div>
                                    <div className="t-meta whitespace-nowrap mt-0.5">{sourceLabel(session.source)}</div>
                                </td>
                                <td><RiskBadge level={session.risk} /></td>
                                <td><ConfidenceMeter value={session.diagnosis?.confidence} className="w-28" /></td>
                                <td><StatusBadge status={session.status} /></td>
                                <td><span className="t-mono text-fg-subtle whitespace-nowrap">{session.session_id}</span></td>
                                <td className="text-right whitespace-nowrap">
                                    <div className="text-fg-muted">{session.started_at ? new Date(session.started_at).toLocaleDateString() : '—'}</div>
                                    <div className="t-meta t-num">{session.started_at ? new Date(session.started_at).toLocaleTimeString() : ''}</div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Activity log view (console-wide)
// ---------------------------------------------------------------------------
const LEVEL_FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'warning', label: 'Warnings' },
    { key: 'error', label: 'Errors' },
    { key: 'success', label: 'Resolved' },
];

function ActivityView({ feed, onOpen }) {
    const [level, setLevel] = useState('all');
    const [query, setQuery] = useState('');

    const q = query.trim().toLowerCase();
    const entries = (feed.entries || []).filter((e) =>
        (level === 'all' || e.level === level) &&
        (!q || [e.merchant_id, e.session_id, e.message, e.stage, e.detail].some((v) => v && String(v).toLowerCase().includes(q)))
    );

    return (
        <div className="card overflow-hidden animate-enter">
            <div className="card-header flex-wrap">
                <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-canvas border border-line" role="tablist" aria-label="Filter by level">
                    {LEVEL_FILTERS.map((f) => (
                        <button
                            key={f.key}
                            role="tab"
                            aria-selected={level === f.key}
                            onClick={() => setLevel(f.key)}
                            className={`h-7 px-2.5 rounded-md text-xs font-medium transition-colors ${level === f.key ? 'bg-surface-3 text-fg shadow-[inset_0_0_0_1px_var(--color-line-strong)]' : 'text-fg-muted hover:text-fg'}`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-3 flex-1 justify-end min-w-[220px]">
                    <div className="relative w-full max-w-72">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-fg-subtle pointer-events-none" />
                        <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Filter by merchant, session or text…"
                            className="input h-8 pl-8 text-[13px] py-0"
                            aria-label="Filter activity"
                        />
                    </div>
                    <span className="t-meta t-num whitespace-nowrap hidden sm:inline">{entries.length} of {feed.total ?? 0}</span>
                </div>
            </div>
            <div className="bg-[#07090c] max-h-[calc(100vh-15rem)] min-h-[320px] overflow-y-auto">
                <ActivityLog
                    entries={entries}
                    emptyText={feed.total ? 'No events match these filters.' : 'No activity yet. Submit a ticket or load demo tickets.'}
                    renderMeta={(e) => (
                        <button
                            onClick={() => onOpen(e.session_id)}
                            className="mt-1 inline-flex items-center gap-2 text-left hover:opacity-80"
                            title="Open incident report"
                        >
                            <MerchantTag merchantId={e.merchant_id} source={e.source} />
                            <span className="t-mono text-fg-subtle truncate max-w-40">{e.session_id}</span>
                        </button>
                    )}
                />
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------
function SkeletonGrid() {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="card p-4 h-[204px] flex flex-col">
                    <div className="flex justify-between">
                        <div className="skeleton h-5 w-16" />
                        <div className="skeleton h-4 w-24" />
                    </div>
                    <div className="skeleton h-4 w-40 mt-4" />
                    <div className="skeleton h-3 w-full mt-3" />
                    <div className="skeleton h-3 w-4/5 mt-2" />
                    <div className="flex justify-between mt-auto pt-3 border-t border-line">
                        <div className="skeleton h-5 w-24" />
                        <div className="skeleton h-4 w-24" />
                    </div>
                </div>
            ))}
        </div>
    );
}
