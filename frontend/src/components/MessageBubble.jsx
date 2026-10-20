import { useState } from 'react';
import { ChevronRight, FileText } from 'lucide-react';

/**
 * Message bubble component for chat messages
 */
export default function MessageBubble({ message, isUser, sources = [] }) {
    const [showSources, setShowSources] = useState(false);

    return (
        <div className={`animate-enter flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
            <div
                className={`max-w-[85%] sm:max-w-[75%] rounded-xl px-4 py-3 text-sm leading-6 ${isUser
                    ? 'bg-accent text-white rounded-br-sm'
                    : 'bg-surface border border-line text-fg rounded-bl-sm'
                    }`}
            >
                <p className="whitespace-pre-wrap break-words">{message}</p>

                {!isUser && sources.length > 0 && (
                    <div className="mt-3 pt-2.5 border-t border-line">
                        <button
                            onClick={() => setShowSources(!showSources)}
                            className="flex items-center gap-1 text-xs font-medium text-fg-muted hover:text-fg transition-colors"
                            aria-expanded={showSources}
                        >
                            <ChevronRight className={`w-3.5 h-3.5 transition-transform ${showSources ? 'rotate-90' : ''}`} />
                            {sources.length} source{sources.length > 1 ? 's' : ''} retrieved
                        </button>

                        {showSources && (
                            <div className="mt-2 space-y-1.5">
                                {sources.map((source, idx) => (
                                    <div key={idx} className="well px-3 py-2 flex gap-2">
                                        <FileText className="w-3.5 h-3.5 mt-0.5 shrink-0 text-fg-subtle" />
                                        <p className="t-meta text-fg-muted line-clamp-3">{source.content}</p>
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
