import React, { useState, useEffect } from 'react';
import {
    Activity, AlertTriangle, CheckCircle, Clock,
    FileText, Server, Shield, Brain, ChevronRight,
    ThumbsUp, ThumbsDown
} from 'lucide-react';
import { getAgentMetrics, getSessionHistory, getApprovalQueue, approveAction } from '../api/client';

export default function AgentDashboard() {
    const [activeTab, setActiveTab] = useState('live');
    const [metrics, setMetrics] = useState(null);
    const [history, setHistory] = useState([]);
    const [queue, setQueue] = useState([]);
    const [activeResult, setActiveResult] = useState(null);

    useEffect(() => {
        refreshData();
        const interval = setInterval(refreshData, 10000); // Auto-refresh every 10s
        return () => clearInterval(interval);
    }, []);

    const refreshData = async () => {
        try {
            const [m, h, q] = await Promise.all([
                getAgentMetrics(),
                getSessionHistory(),
                getApprovalQueue()
            ]);
            setMetrics(m);
            setHistory(h.sessions || []);
            setQueue(q.items || []);
        } catch (error) {
            console.error("Failed to fetch data:", error);
        }
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

    return (
        <div className="flex h-screen bg-gray-50 text-gray-900 font-sans">
            {/* Sidebar */}
            <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
                <div className="p-6 border-b border-gray-100">
                    <h1 className="text-xl font-bold flex items-center gap-2 text-indigo-600">
                        <Shield className="w-6 h-6" />
                        MigraGuard
                    </h1>
                    <p className="text-xs text-gray-500 mt-1">Self-Healing Agent</p>
                </div>

                <nav className="flex-1 p-4 space-y-1">
                    <TabButton
                        id="live"
                        label="Live Analysis"
                        icon={<Brain className="w-4 h-4" />}
                        active={activeTab}
                        onClick={setActiveTab}
                    />
                    <TabButton
                        id="queue"
                        label="Approval Queue"
                        icon={<Clock className="w-4 h-4" />}
                        active={activeTab}
                        onClick={setActiveTab}
                        badge={queue.length}
                    />
                    <TabButton
                        id="history"
                        label="Session History"
                        icon={<FileText className="w-4 h-4" />}
                        active={activeTab}
                        onClick={setActiveTab}
                    />
                </nav>

                <div className="p-4 bg-gray-50 border-t border-gray-200">
                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">System Health</h3>
                    <MetricRow label="Success Rate" value={metrics ? `${(metrics.success_rate * 100).toFixed(0)}%` : '-'} />
                    <MetricRow label="Total Sessions" value={metrics ? metrics.total_sessions : '-'} />
                    <MetricRow label="Learning Events" value={metrics ? metrics.learning_events_count : '-'} />
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-auto">
                <header className="bg-white border-b border-gray-200 p-6">
                    <h2 className="text-2xl font-semibold text-gray-800">
                        {activeTab === 'live' && 'Live Issue Analysis'}
                        {activeTab === 'queue' && 'Action Approvals'}
                        {activeTab === 'history' && 'Past Sessions'}
                    </h2>
                </header>

                <main className="p-6">
                    {activeTab === 'live' && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Active Problem Clusters - Left Column */}
                            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                                <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                                    <h3 className="font-bold text-gray-700 flex items-center gap-2">
                                        <Activity className="w-4 h-4 text-indigo-500" />
                                        Active Problem Clusters
                                    </h3>
                                    <button
                                        onClick={refreshData}
                                        className="text-xs text-indigo-600 hover:underline flex items-center gap-1"
                                    >
                                        <Server className="w-3 h-3" /> Refresh
                                    </button>
                                </div>
                                <div className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
                                    {history.length === 0 ? (
                                        <div className="p-10 text-center text-gray-400 italic">
                                            <Brain className="w-8 h-8 mx-auto mb-2 opacity-30" />
                                            No tickets found in queue.
                                            <p className="text-xs mt-2">Run the ingestion script to load tickets.</p>
                                        </div>
                                    ) : (
                                        history.map((session) => (
                                            <div
                                                key={session.session_id || session.id}
                                                onClick={() => setActiveResult(session)}
                                                className={`p-4 cursor-pointer transition hover:bg-indigo-50 
                                                    ${activeResult?.session_id === session.session_id || activeResult?.id === session.id
                                                        ? 'bg-indigo-50 border-l-4 border-indigo-500'
                                                        : ''}`}
                                            >
                                                <div className="flex justify-between items-start mb-1">
                                                    <span className="text-sm font-bold text-gray-900 truncate max-w-[180px]">
                                                        {session.diagnosis?.root_cause?.replace(/_/g, ' ').toUpperCase() || "Analyzing..."}
                                                    </span>
                                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase 
                                                        ${session.risk === 'high' || session.risk === 'critical'
                                                            ? 'bg-red-100 text-red-600'
                                                            : session.risk === 'medium'
                                                                ? 'bg-yellow-100 text-yellow-600'
                                                                : 'bg-gray-100 text-gray-600'}`}
                                                    >
                                                        {session.risk || 'Low'}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-gray-500 line-clamp-2">
                                                    {session.explanation?.substring(0, 80) || "Processing..."}...
                                                </p>
                                                <div className="mt-2 flex items-center justify-between text-[10px] text-gray-400">
                                                    <span className="font-mono">
                                                        {(session.session_id || session.id)?.substring(0, 8)}
                                                    </span>
                                                    <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full
                                                        ${session.status === 'dispatched' ? 'bg-green-100 text-green-600' :
                                                            session.status === 'awaiting_approval' ? 'bg-orange-100 text-orange-600' :
                                                                'bg-blue-100 text-blue-600'}`}
                                                    >
                                                        <Clock className="w-3 h-3" />
                                                        {session.status?.replace(/_/g, ' ')}
                                                    </span>
                                                </div>
                                                {session.requires_approval && session.status !== 'dispatched' && (
                                                    <div className="mt-2 text-[10px] text-orange-600 flex items-center gap-1">
                                                        <AlertTriangle className="w-3 h-3" />
                                                        Requires human approval
                                                    </div>
                                                )}
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* Result Display - Right Column */}
                            <div className="space-y-6">
                                {activeResult ? (
                                    <div className="bg-white rounded-xl shadow-lg border border-indigo-100 overflow-hidden">
                                        <div className="bg-gradient-to-r from-indigo-500 to-purple-600 p-6 text-white">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <h3 className="text-lg font-bold">Session Details</h3>
                                                    <p className="text-indigo-100 text-sm mt-1">
                                                        {activeResult.diagnosis?.root_cause?.replace(/_/g, ' ') || "Analysis in progress"}
                                                    </p>
                                                </div>
                                                <div className="bg-white/20 backdrop-blur-sm px-3 py-1 rounded text-sm font-bold">
                                                    {activeResult.diagnosis
                                                        ? `${(activeResult.diagnosis.confidence * 100).toFixed(0)}% Confidence`
                                                        : 'Processing...'}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="p-6 space-y-6">
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="p-4 bg-gray-50 rounded-lg">
                                                    <div className="text-xs text-gray-500 uppercase font-semibold mb-1">Root Cause</div>
                                                    <div className="font-medium text-gray-900">
                                                        {activeResult.diagnosis?.root_cause?.replace(/_/g, ' ') || "Pending"}
                                                    </div>
                                                </div>
                                                <div className={`p-4 rounded-lg 
                                                    ${activeResult.risk === 'high' || activeResult.risk === 'critical'
                                                        ? 'bg-red-50 text-red-700'
                                                        : 'bg-green-50 text-green-700'}`}
                                                >
                                                    <div className="text-xs uppercase font-semibold mb-1 opacity-75">Risk Level</div>
                                                    <div className="font-medium capitalize">{activeResult.risk || 'Low'}</div>
                                                </div>
                                            </div>

                                            <div>
                                                <h4 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
                                                    <Brain className="w-4 h-4 text-indigo-500" />
                                                    AI Reasoning (Internal Only)
                                                </h4>
                                                <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap bg-gray-50 p-4 rounded-lg border border-gray-200">
                                                    {activeResult.explanation || "Processing..."}
                                                </p>
                                            </div>

                                            <div className="flex gap-2 items-center text-xs text-gray-400">
                                                <span>Session:</span>
                                                <code className="bg-gray-100 px-2 py-1 rounded font-mono">
                                                    {activeResult.session_id || activeResult.id}
                                                </code>
                                                <span className={`ml-auto px-2 py-1 rounded-full font-medium
                                                    ${activeResult.status === 'dispatched' ? 'bg-green-100 text-green-700' :
                                                        activeResult.status === 'awaiting_approval' ? 'bg-orange-100 text-orange-700' :
                                                            'bg-blue-100 text-blue-700'}`}
                                                >
                                                    {activeResult.status?.replace(/_/g, ' ').toUpperCase()}
                                                </span>
                                            </div>

                                            {/* Conditional Approval UI */}
                                            {activeResult.status === 'awaiting_approval' && (
                                                <div className="pt-4 border-t border-gray-100 space-y-4">
                                                    <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg flex gap-3 text-yellow-800 text-sm">
                                                        <AlertTriangle className="w-5 h-5 shrink-0" />
                                                        <div>
                                                            <span className="font-bold">Ready for Review: </span>
                                                            AI has drafted a solution. Review and send to merchant or reject.
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-3">
                                                        <button
                                                            onClick={() => handleApproval(activeResult.session_id || activeResult.id, true)}
                                                            className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2.5 rounded-lg font-bold flex items-center justify-center gap-2 transition shadow-md"
                                                        >
                                                            <ThumbsUp className="w-4 h-4" /> Send to Merchant
                                                        </button>
                                                        <button
                                                            onClick={() => handleApproval(activeResult.session_id || activeResult.id, false)}
                                                            className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-lg font-bold flex items-center justify-center gap-2 transition shadow-md"
                                                        >
                                                            <ThumbsDown className="w-4 h-4" /> Reject Fix
                                                        </button>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Already dispatched/completed */}
                                            {['dispatched', 'completed'].includes(activeResult.status) && (
                                                <div className="p-4 bg-green-50 border border-green-200 text-green-700 rounded-lg text-center font-medium flex items-center justify-center gap-2">
                                                    <CheckCircle className="w-5 h-5" />
                                                    Solution has been {activeResult.status === 'dispatched' ? 'sent to merchant' : 'completed'}.
                                                </div>
                                            )}

                                            {/* Still analyzing */}
                                            {['analyzing', 'diagnosing', 'observing', 'searching'].includes(activeResult.status) && (
                                                <div className="p-4 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg text-center font-medium flex items-center justify-center gap-2">
                                                    <Clock className="w-5 h-5 animate-pulse" />
                                                    AI is still analyzing this issue...
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="h-full min-h-[400px] flex items-center justify-center bg-white rounded-xl border border-dashed border-gray-300 text-gray-400">
                                        <div className="text-center">
                                            <Brain className="w-12 h-12 mx-auto mb-2 opacity-20" />
                                            <p>Select a ticket to view details</p>
                                            <p className="text-xs mt-1">Click on any item in the left panel</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'queue' && (
                        <div className="space-y-4">
                            {queue.length === 0 ? (
                                <EmptyState message="No actions pending approval." />
                            ) : (
                                queue.map(item => (
                                    <ApprovalCard key={item.id} item={item} onApprove={handleApproval} />
                                ))
                            )}
                        </div>
                    )}

                    {activeTab === 'history' && (
                        <div className="space-y-4">
                            {history.length === 0 ? (
                                <EmptyState message="No history available yet." />
                            ) : (
                                history.map(session => (
                                    <div key={session.session_id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                                        <div className="flex justify-between items-start mb-4">
                                            <div>
                                                <span className={`inline-block px-2 py-1 rounded text-xs font-semibold mb-2
                                                    ${session.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}
                                                `}>
                                                    {session.status.toUpperCase()}
                                                </span>
                                                <h4 className="font-medium text-lg text-gray-800">Session #{session.id.substring(0, 8)}</h4>
                                                <p className="text-sm text-gray-500 mt-1">
                                                    Started: {new Date(session.started_at).toLocaleString()}
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <span className="text-xs text-gray-400">Diagnosis Confidence</span>
                                                <div className="font-bold text-gray-700">
                                                    {session.diagnosis ? (session.diagnosis.confidence * 100).toFixed(0) : 0}%
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}

function TabButton({ id, label, icon, active, onClick, badge }) {
    return (
        <button
            onClick={() => onClick(id)}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition
                ${active === id
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}
            `}
        >
            <div className="flex items-center gap-3">
                {icon}
                {label}
            </div>
            {badge > 0 && (
                <span className="bg-red-100 text-red-600 text-xs py-0.5 px-2 rounded-full">
                    {badge}
                </span>
            )}
        </button>
    );
}

function MetricRow({ label, value }) {
    return (
        <div className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
            <span className="text-sm text-gray-500">{label}</span>
            <span className="text-sm font-semibold text-gray-900">{value}</span>
        </div>
    );
}

function AgentResultCard({ result }) {
    return (
        <div className="bg-white rounded-xl shadow-lg border border-indigo-100 overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-500 to-purple-600 p-6 text-white">
                <div className="flex justify-between items-start">
                    <div>
                        <h3 className="text-lg font-bold">Analysis Complete</h3>
                        <p className="text-indigo-100 text-sm mt-1">{result.observed_pattern}</p>
                    </div>
                    <div className="bg-white/20 backdrop-blur-sm px-3 py-1 rounded text-sm font-bold">
                        {(result.confidence * 100).toFixed(0)}% Confidence
                    </div>
                </div>
            </div>

            <div className="p-6 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-gray-50 rounded-lg">
                        <div className="text-xs text-gray-500 uppercase font-semibold mb-1">Root Cause</div>
                        <div className="font-medium text-gray-900">{result.root_cause}</div>
                    </div>
                    <div className={`p-4 rounded-lg bg-opacity-10
                        ${result.risk === 'high' ? 'bg-red-500 text-red-700' : 'bg-green-500 text-green-700'}
                    `}>
                        <div className="text-xs uppercase font-semibold mb-1 opacity-75">Risk Level</div>
                        <div className="font-medium capitalize">{result.risk}</div>
                    </div>
                </div>

                <div>
                    <h4 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-500" />
                        Recommended Action
                    </h4>
                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 text-sm text-gray-700 whitespace-pre-wrap font-mono">
                        {result.recommended_action}
                    </div>
                </div>

                <div>
                    <h4 className="font-semibold text-gray-800 mb-2">My Reasoning</h4>
                    <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
                        {result.explanation}
                    </p>
                </div>

                {result.requires_human_approval && (
                    <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg flex gap-3 text-yellow-800 text-sm">
                        <AlertTriangle className="w-5 h-5 shrink-0" />
                        <div>
                            <span className="font-bold">Human Approval Required: </span>
                            This action meets the criteria for manual review (high risk or low confidence).
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function ApprovalCard({ item, onApprove }) {
    return (
        <div className="bg-white rounded-xl shadow-sm border border-orange-200 overflow-hidden">
            <div className="bg-orange-50 px-6 py-4 border-b border-orange-100 flex justify-between items-center">
                <span className="font-semibold text-orange-800 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    Approval Request - Pending Dispatch
                </span>
                <span className="text-xs text-orange-600">{new Date(item.created_at).toLocaleString()}</span>
            </div>
            <div className="p-6">
                <div className="mb-4">
                    <div className="text-sm font-medium text-gray-500 mb-1">Proposed Response to Merchant</div>
                    <div className="bg-gray-50 p-3 rounded text-sm font-mono border border-gray-200">
                        {item.proposed_action.draft_content}
                    </div>
                </div>
                <div className="mb-6 grid grid-cols-2 gap-4 text-sm">
                    <div>
                        <span className="text-gray-500">Root Cause:</span>
                        <span className="ml-2 font-medium">{item.diagnosis.root_cause}</span>
                    </div>
                    <div>
                        <span className="text-gray-500">Risk Level:</span>
                        <span className="ml-2 font-medium capitalize text-orange-600">{item.risk_assessment.risk_level}</span>
                    </div>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={() => onApprove(item.id, true)}
                        className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg font-medium flex items-center justify-center gap-2 transition"
                    >
                        <ThumbsUp className="w-4 h-4" /> Send Resolution to Merchant
                    </button>
                    <button
                        onClick={() => onApprove(item.id, false)}
                        className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg font-medium flex items-center justify-center gap-2 transition"
                    >
                        <ThumbsDown className="w-4 h-4" /> Reject
                    </button>
                </div>
            </div>
        </div>
    );
}

function EmptyState({ message }) {
    return (
        <div className="py-12 text-center text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-200">
            {message}
        </div>
    );
}
