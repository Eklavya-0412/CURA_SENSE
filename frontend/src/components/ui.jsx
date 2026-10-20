import React from 'react';
import {
    Shield, CheckCircle2, Clock, Loader2, AlertTriangle, XCircle, Check, Circle,
    Store, Globe, Webhook, Radar, Code2, Database, Info
} from 'lucide-react';
import { humanize, sourceLabel, formatTime, formatDuration } from '../lib/format';

// ---------------------------------------------------------------------------
// Brand mark
// ---------------------------------------------------------------------------
export function BrandMark({ subtitle, compact = false }) {
    return (
        <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-accent/15 ring-1 ring-inset ring-accent/30 text-accent shrink-0">
                <Shield className="w-4 h-4" strokeWidth={2.25} />
            </div>
            {!compact && (
                <div className="min-w-0 leading-tight">
                    <div className="text-sm font-semibold tracking-tight text-fg">CuraSense</div>
                    {subtitle && <div className="t-meta truncate">{subtitle}</div>}
                </div>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Severity / risk
// ---------------------------------------------------------------------------
const RISK_STYLES = {
    critical: 'badge-critical',
    high: 'badge-danger',
    medium: 'badge-warning',
    low: 'badge-success',
};


export function RiskBadge({ level }) {
    const key = (level || 'low').toLowerCase();
    return (
        <span className={`badge badge-dot ${RISK_STYLES[key] || 'badge-neutral'}`}>
            {humanize(key)}
        </span>
    );
}

// ---------------------------------------------------------------------------
// Session status
// ---------------------------------------------------------------------------
const STATUS_CONFIG = {
    dispatched: { tone: 'badge-success', icon: CheckCircle2, label: 'Dispatched' },
    completed: { tone: 'badge-success', icon: CheckCircle2, label: 'Completed' },
    resolved: { tone: 'badge-success', icon: CheckCircle2, label: 'Resolved' },
    auto_fixed: { tone: 'badge-success', icon: CheckCircle2, label: 'Auto-fixed' },
    awaiting_approval: { tone: 'badge-warning', icon: Clock, label: 'Needs approval' },
    requires_approval: { tone: 'badge-warning', icon: Clock, label: 'Needs approval' },
    in_review: { tone: 'badge-warning', icon: Clock, label: 'In review' },
    pending: { tone: 'badge-warning', icon: Clock, label: 'Pending' },
    failed: { tone: 'badge-danger', icon: XCircle, label: 'Failed' },
    rejected: { tone: 'badge-danger', icon: XCircle, label: 'Rejected' },
};

export function StatusBadge({ status }) {
    const cfg = STATUS_CONFIG[status] || {
        tone: 'badge-accent',
        icon: Loader2,
        label: status ? humanize(status) : 'Analyzing',
        spin: true,
    };
    const Icon = cfg.icon;
    return (
        <span className={`badge ${cfg.tone}`}>
            <Icon className={cfg.spin ? 'animate-spin' : ''} />
            {cfg.label}
        </span>
    );
}

// ---------------------------------------------------------------------------
// Confidence meter
// ---------------------------------------------------------------------------
export function ConfidenceMeter({ value, className = '' }) {
    if (value === null || value === undefined) {
        return <span className="t-meta">—</span>;
    }
    const pct = Math.max(0, Math.min(1, value)) * 100;
    const color = value >= 0.85 ? 'var(--color-success)' : value >= 0.6 ? 'var(--color-warning)' : 'var(--color-danger)';
    return (
        <div className={`flex items-center gap-2 ${className}`}>
            <div className="meter flex-1 min-w-12">
                <span style={{ width: `${pct}%`, background: color }} />
            </div>
            <span className="text-xs font-medium text-fg-muted t-num w-8 text-right">{Math.round(pct)}%</span>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Agent workflow stepper — mirrors the LangGraph HealingStatus stages
// ---------------------------------------------------------------------------
const WORKFLOW_STEPS = [
    { key: 'observe', label: 'Observe', states: ['received', 'processing', 'observing', 'clustering'] },
    { key: 'retrieve', label: 'Retrieve', states: ['searching'] },
    { key: 'diagnose', label: 'Diagnose', states: ['analyzing', 'diagnosing'] },
    { key: 'assess', label: 'Assess risk', states: ['assessing'] },
    { key: 'draft', label: 'Draft fix', states: ['deciding', 'acting'] },
    { key: 'approve', label: 'Approval', states: ['awaiting_approval', 'requires_approval', 'pending', 'in_review'] },
    { key: 'resolve', label: 'Resolved', states: ['completed', 'dispatched', 'resolved', 'auto_fixed'] },
];

export function WorkflowStepper({ status, requiresApproval }) {
    const isDone = ['completed', 'dispatched', 'resolved', 'auto_fixed'].includes(status);
    const isFailed = status === 'failed' || status === 'rejected';
    let currentIndex = WORKFLOW_STEPS.findIndex((s) => s.states.includes(status));
    if (currentIndex === -1) currentIndex = isFailed ? WORKFLOW_STEPS.length - 1 : 2;

    return (
        <ol className="grid grid-cols-7 gap-1">
            {WORKFLOW_STEPS.map((step, i) => {
                let state = 'upcoming';
                if (isDone || i < currentIndex) state = 'done';
                else if (i === currentIndex) state = isFailed ? 'failed' : 'current';
                const skipped = step.key === 'approve' && state === 'done' && requiresApproval === false;

                const bar = {
                    done: 'bg-success',
                    current: 'bg-warning',
                    failed: 'bg-danger',
                    upcoming: 'bg-surface-3',
                }[state];
                const text = {
                    done: 'text-fg-muted',
                    current: 'text-fg',
                    failed: 'text-danger',
                    upcoming: 'text-fg-subtle',
                }[state];
                const waitingOnHuman = state === 'current' && step.key === 'approve';
                const Icon = state === 'done' ? Check
                    : state === 'failed' ? XCircle
                        : waitingOnHuman ? Clock
                            : state === 'current' ? Loader2 : Circle;

                return (
                    <li key={step.key} className="min-w-0">
                        <div className={`h-1 rounded-full ${skipped ? 'bg-line-strong' : bar}`} />
                        <div className={`mt-2 flex items-center gap-1.5 text-[11px] leading-4 font-medium ${text}`}>
                            <Icon className={`w-3 h-3 shrink-0 ${state === 'current' && !waitingOnHuman ? 'animate-spin' : ''}`} />
                            <span className="truncate">{step.label}</span>
                        </div>
                        {skipped && <div className="t-meta text-[10px] mt-0.5 truncate">Auto</div>}
                    </li>
                );
            })}
        </ol>
    );
}

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------
export function SectionLabel({ children, className = '' }) {
    return <div className={`t-overline mb-2 ${className}`}>{children}</div>;
}

export function EmptyState({ icon: Icon = AlertTriangle, title, description, children }) {
    return (
        <div className="card border-dashed flex flex-col items-center text-center px-6 py-14">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-surface-3 text-fg-muted mb-4">
                <Icon className="w-5 h-5" />
            </div>
            <h3 className="t-h2">{title}</h3>
            {description && <p className="t-body mt-1.5 max-w-md">{description}</p>}
            {children && <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{children}</div>}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Merchant / channel attribution
// ---------------------------------------------------------------------------
const SOURCE_ICONS = {
    merchant_portal: Globe,
    webhook: Webhook,
    monitor: Radar,
    api: Code2,
    demo: Database,
};

export function MerchantTag({ merchantId, source, showSource = true, className = '' }) {
    const SourceIcon = SOURCE_ICONS[source] || Globe;
    return (
        <span className={`inline-flex items-center gap-1.5 min-w-0 text-xs leading-4 ${className}`}>
            <Store className="w-3.5 h-3.5 shrink-0 text-fg-subtle" />
            <span className="font-medium text-fg-muted truncate t-mono">{merchantId || 'unknown'}</span>
            {showSource && source && (
                <>
                    <span className="text-fg-subtle" aria-hidden>·</span>
                    <span className="inline-flex items-center gap-1 text-fg-subtle whitespace-nowrap">
                        <SourceIcon className="w-3 h-3 shrink-0" />
                        {sourceLabel(source)}
                    </span>
                </>
            )}
        </span>
    );
}

// ---------------------------------------------------------------------------
// Activity log (per-session or console-wide)
// ---------------------------------------------------------------------------
const LEVEL_STYLES = {
    info: { dot: 'bg-accent', text: 'text-fg', icon: Info },
    success: { dot: 'bg-success', text: 'text-fg', icon: CheckCircle2 },
    warning: { dot: 'bg-warning', text: 'text-fg', icon: AlertTriangle },
    error: { dot: 'bg-danger', text: 'text-[#ff8a8a]', icon: XCircle },
};

export function LogLevelDot({ level }) {
    const style = LEVEL_STYLES[level] || LEVEL_STYLES.info;
    return <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} aria-label={level} />;
}

/**
 * Renders activity log entries as a compact, monospace timeline.
 * `entries` are backend activity_log items: { ts, stage, level, message, detail?, duration_ms? }.
 */
export function ActivityLog({ entries, emptyText = 'No activity recorded yet.', renderMeta }) {
    if (!entries || entries.length === 0) {
        return <div className="px-4 py-6 text-center t-meta">{emptyText}</div>;
    }
    return (
        <ol className="divide-y divide-line/70">
            {entries.map((e, i) => {
                const style = LEVEL_STYLES[e.level] || LEVEL_STYLES.info;
                return (
                    <li key={`${e.ts}-${i}`} className="px-4 py-2 grid grid-cols-[88px_1fr] sm:grid-cols-[88px_140px_1fr_auto] gap-x-3 gap-y-0.5 items-start">
                        <span className="t-mono text-fg-subtle t-num pt-px whitespace-nowrap">{formatTime(e.ts)}</span>
                        <span className="hidden sm:flex items-center gap-1.5 t-mono text-fg-muted pt-px min-w-0">
                            <LogLevelDot level={e.level} />
                            <span className="truncate">{e.stage}</span>
                        </span>
                        <div className="min-w-0 col-start-2 sm:col-start-3">
                            <div className={`text-[13px] leading-5 ${style.text}`}>
                                <span className="sm:hidden t-mono text-fg-subtle mr-1.5">{e.stage}</span>
                                {e.message}
                            </div>
                            {e.detail && <div className="t-meta mt-0.5 line-clamp-2 break-words">{e.detail}</div>}
                            {renderMeta && renderMeta(e)}
                        </div>
                        <span className="hidden sm:block t-mono text-fg-subtle t-num text-right pt-px">{formatDuration(e.duration_ms)}</span>
                    </li>
                );
            })}
        </ol>
    );
}
