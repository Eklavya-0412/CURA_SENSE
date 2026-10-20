// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------
export function humanize(value, fallback = '') {
    if (!value) return fallback;
    const text = String(value).replace(/_/g, ' ').trim();
    return text.charAt(0).toUpperCase() + text.slice(1);
}

export function formatPercent(value, fallback = '—') {
    if (value === null || value === undefined || Number.isNaN(value)) return fallback;
    return `${Math.round(value * 100)}%`;
}

export function formatDateTime(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Hex (not CSS vars) so the values also work as SVG presentation attributes in charts.
export const RISK_COLORS = {
    critical: '#ff4d6d',
    high: '#ef5d5d',
    medium: '#e3a43b',
    low: '#34b27b',
};

// Channel a ticket arrived through (backend `source` field)
export const SOURCE_LABELS = {
    merchant_portal: 'Merchant portal',
    webhook: 'Error webhook',
    monitor: 'Live monitor',
    api: 'Client API',
    demo: 'Demo data',
};

export function sourceLabel(source) {
    return SOURCE_LABELS[source] || (source ? humanize(source) : 'Unknown channel');
}

export function formatTime(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function formatDuration(ms) {
    if (ms === null || ms === undefined) return '';
    return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}
