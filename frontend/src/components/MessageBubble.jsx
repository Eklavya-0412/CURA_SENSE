import { useState } from 'react';

/**
 * Message bubble component for chat messages
 */
export default function MessageBubble({ message, isUser, sources = [] }) {
    const [showSources, setShowSources] = useState(false);

    return (
        <div
            className={`fade-in flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}
        >
            <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 ${isUser
                        ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white'
                        : 'glass text-slate-100'
                    }`}
            >
                <p className="whitespace-pre-wrap">{message}</p>

                {!isUser && sources.length > 0 && (
                    <div className="mt-3 pt-2 border-t border-white/10">
                        <button
                            onClick={() => setShowSources(!showSources)}
                            className="text-cyan-400 text-sm hover:text-cyan-300 transition-colors flex items-center gap-1"
                        >
                            <svg
                                className={`w-4 h-4 transition-transform ${showSources ? 'rotate-90' : ''}`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M9 5l7 7-7 7"
                                />
                            </svg>
                            {sources.length} source{sources.length > 1 ? 's' : ''}
                        </button>

                        {showSources && (
                            <div className="mt-2 space-y-2">
                                {sources.map((source, idx) => (
                                    <div
                                        key={idx}
                                        className="text-sm text-slate-400 bg-white/5 rounded-lg p-2"
                                    >
                                        <p className="line-clamp-3">{source.content}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
