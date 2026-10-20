import { useState, useRef, useEffect } from 'react';
import MessageBubble from './MessageBubble';
import FileUpload from './FileUpload';
import { sendMessage, clearChatHistory, uploadPdf } from '../api/client';
import { Sparkles, Upload, Trash2, MessageSquare, Loader2, Send } from 'lucide-react';

/**
 * Main chat interface component
 */
// Collection the knowledge-base docs are ingested into (backend/scripts/ingest_initial.py).
// Uploads go to the same collection so they are searchable from the chat.
const KB_COLLECTION = 'knowledge_base';

const STARTER_PROMPTS = [
    'Our webhooks stopped arriving after the migration. What should I check?',
    'How long do access tokens last, and what changed from the old API?',
    'Stripe says "Invalid API key" after we migrated. How do I fix it?',
    'We are getting 429 errors on bulk product sync. What are the rate limits?',
];

export default function ChatInterface({ embedded = false }) {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [useRag, setUseRag] = useState(true);
    const [showUpload, setShowUpload] = useState(false);
    const [notification, setNotification] = useState(null);
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const showNotification = (message, type = 'info') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 3000);
    };

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;

        const userMessage = input.trim();
        setInput('');
        setMessages((prev) => [...prev, { content: userMessage, isUser: true }]);
        setIsLoading(true);

        try {
            const response = await sendMessage(userMessage, KB_COLLECTION, useRag);
            setMessages((prev) => [
                ...prev,
                {
                    content: response.response,
                    isUser: false,
                    sources: response.sources || [],
                },
            ]);
        } catch (error) {
            showNotification(error.message, 'error');
            setMessages((prev) => [
                ...prev,
                {
                    content: 'Sorry, there was an error processing your request.',
                    isUser: false,
                },
            ]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleClearHistory = async () => {
        try {
            await clearChatHistory();
            setMessages([]);
            showNotification('Chat history cleared', 'success');
        } catch (error) {
            showNotification('Failed to clear history', 'error');
        }
    };

    const handleUpload = async (file) => {
        setIsUploading(true);
        try {
            const response = await uploadPdf(file, KB_COLLECTION);
            showNotification(`Uploaded: ${response.chunk_count} chunks processed`, 'success');
            setShowUpload(false);
        } catch (error) {
            showNotification(error.message, 'error');
        } finally {
            setIsUploading(false);
        }
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className={embedded
            ? 'card overflow-hidden flex flex-col h-[calc(100vh-12rem)] min-h-[520px] text-fg'
            : 'flex flex-col h-screen bg-canvas text-fg'}>
            {/* Header */}
            <header className="border-b border-line bg-surface">
                <div className="max-w-4xl mx-auto h-16 px-4 sm:px-6 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-accent/15 ring-1 ring-inset ring-accent/30 text-accent shrink-0">
                            <Sparkles className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 leading-tight">
                            <h1 className="t-h3">Troubleshooting assistant</h1>
                            <p className="t-meta truncate">Answers grounded in your knowledge base</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        {/* RAG Toggle */}
                        <button
                            type="button"
                            role="switch"
                            aria-checked={useRag}
                            onClick={() => setUseRag(!useRag)}
                            className="btn btn-ghost btn-sm gap-2"
                            title="Retrieve context from the knowledge base"
                        >
                            <span className="text-xs font-medium">RAG</span>
                            <span className={`relative w-8 h-[18px] rounded-full transition-colors ${useRag ? 'bg-accent' : 'bg-surface-3 ring-1 ring-inset ring-line-strong'}`}>
                                <span className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-transform ${useRag ? 'translate-x-[16px]' : 'translate-x-[2px]'}`} />
                            </span>
                        </button>

                        <button
                            onClick={() => setShowUpload(!showUpload)}
                            className={`btn btn-ghost btn-icon btn-sm ${showUpload ? 'text-fg bg-surface-2' : ''}`}
                            title="Upload document"
                            aria-label="Upload document"
                        >
                            <Upload />
                        </button>

                        <button
                            onClick={handleClearHistory}
                            className="btn btn-ghost btn-icon btn-sm"
                            title="Clear history"
                            aria-label="Clear history"
                        >
                            <Trash2 />
                        </button>
                    </div>
                </div>
            </header>

            {/* Notification */}
            {notification && (
                <div
                    role="status"
                    className={`fixed top-20 right-4 z-50 card px-3.5 py-2.5 flex items-center gap-2 text-[13px] animate-enter ${notification.type === 'error'
                        ? 'border-danger/40 text-[#ff8a8a]'
                        : notification.type === 'success'
                            ? 'border-success/40 text-[#5fd09d]'
                            : 'border-accent/40 text-[#8fb6ff]'
                        }`}
                >
                    {notification.message}
                </div>
            )}

            {/* Upload Panel */}
            {showUpload && (
                <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 pt-4">
                    <FileUpload onUpload={handleUpload} isUploading={isUploading} />
                </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
                <div className="max-w-4xl mx-auto">
                    {messages.length === 0 ? (
                        <div className="text-center py-16">
                            <div className="w-10 h-10 mx-auto mb-4 rounded-lg bg-surface-3 text-fg-muted flex items-center justify-center">
                                <MessageSquare className="w-5 h-5" />
                            </div>
                            <h2 className="t-h2">Ask about a migration issue</h2>
                            <p className="t-body mt-1.5 max-w-md mx-auto">
                                Answers are grounded in the migration knowledge base. Upload PDFs to extend it; toggle RAG to compare with an ungrounded answer.
                            </p>
                            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-2xl mx-auto text-left">
                                {STARTER_PROMPTS.map((prompt) => (
                                    <button
                                        key={prompt}
                                        onClick={() => setInput(prompt)}
                                        className="px-3 py-2.5 rounded-lg border border-line bg-surface-2 text-[13px] leading-5 text-fg-muted hover:text-fg hover:border-line-strong transition-colors"
                                    >
                                        {prompt}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        messages.map((msg, idx) => (
                            <MessageBubble
                                key={idx}
                                message={msg.content}
                                isUser={msg.isUser}
                                sources={msg.sources}
                            />
                        ))
                    )}

                    {isLoading && (
                        <div className="flex justify-start mb-4">
                            <div className="card px-4 py-3 flex items-center gap-2 t-meta">
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
                                Searching knowledge base…
                            </div>
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>
            </div>

            {/* Input Area */}
            <div className="border-t border-line bg-surface px-4 sm:px-6 py-3">
                <div className="max-w-4xl mx-auto flex items-end gap-2">
                    <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyPress={handleKeyPress}
                        placeholder="Ask anything…  (Enter to send, Shift+Enter for a new line)"
                        rows={1}
                        className="input flex-1 resize-none min-h-[40px] max-h-40"
                    />
                    <button
                        onClick={handleSend}
                        disabled={!input.trim() || isLoading}
                        className="btn btn-primary btn-lg"
                    >
                        <Send />
                        Send
                    </button>
                </div>
            </div>
        </div>
    );
}
