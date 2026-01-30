import { useState, useRef, useEffect } from 'react';
import MessageBubble from './MessageBubble';
import FileUpload from './FileUpload';
import { sendMessage, clearChatHistory, uploadPdf } from '../api/client';

/**
 * Main chat interface component
 */
export default function ChatInterface() {
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
            const response = await sendMessage(userMessage, 'default', useRag);
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
            const response = await uploadPdf(file);
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
        <div className="flex flex-col h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950">
            {/* Header */}
            <header className="glass border-b border-white/10 px-6 py-4">
                <div className="max-w-4xl mx-auto flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold gradient-text">Agentic AI</h1>
                        <p className="text-slate-400 text-sm">Powered by LangChain & RAG</p>
                    </div>
                    <div className="flex items-center gap-4">
                        {/* RAG Toggle */}
                        <label className="flex items-center gap-2 cursor-pointer">
                            <span className="text-sm text-slate-400">RAG</span>
                            <div
                                onClick={() => setUseRag(!useRag)}
                                className={`w-10 h-5 rounded-full transition-colors ${useRag ? 'bg-indigo-500' : 'bg-slate-600'
                                    } relative`}
                            >
                                <div
                                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${useRag ? 'translate-x-5' : 'translate-x-0.5'
                                        }`}
                                />
                            </div>
                        </label>

                        {/* Upload Button */}
                        <button
                            onClick={() => setShowUpload(!showUpload)}
                            className="p-2 rounded-lg hover:bg-white/10 transition-colors text-slate-300"
                            title="Upload Document"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                            </svg>
                        </button>

                        {/* Clear History */}
                        <button
                            onClick={handleClearHistory}
                            className="p-2 rounded-lg hover:bg-white/10 transition-colors text-slate-300"
                            title="Clear History"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </button>
                    </div>
                </div>
            </header>

            {/* Notification */}
            {notification && (
                <div
                    className={`fixed top-20 right-4 z-50 px-4 py-2 rounded-lg fade-in ${notification.type === 'error'
                            ? 'bg-red-500/90'
                            : notification.type === 'success'
                                ? 'bg-green-500/90'
                                : 'bg-indigo-500/90'
                        }`}
                >
                    {notification.message}
                </div>
            )}

            {/* Upload Panel */}
            {showUpload && (
                <div className="max-w-4xl mx-auto w-full px-6 py-4">
                    <FileUpload onUpload={handleUpload} isUploading={isUploading} />
                </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
                <div className="max-w-4xl mx-auto">
                    {messages.length === 0 ? (
                        <div className="text-center py-20">
                            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 flex items-center justify-center pulse-glow">
                                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
                                </svg>
                            </div>
                            <h2 className="text-xl font-semibold text-white mb-2">Ready to assist you</h2>
                            <p className="text-slate-400 max-w-md mx-auto">
                                Upload documents to build your knowledge base, then ask questions!
                                Toggle RAG on/off to control context retrieval.
                            </p>
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
                            <div className="glass rounded-2xl px-4 py-3">
                                <div className="flex gap-1">
                                    <div className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                                    <div className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                                    <div className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                                </div>
                            </div>
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>
            </div>

            {/* Input Area */}
            <div className="glass border-t border-white/10 px-6 py-4">
                <div className="max-w-4xl mx-auto">
                    <div className="flex gap-3">
                        <textarea
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyPress={handleKeyPress}
                            placeholder="Ask anything..."
                            rows={1}
                            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 resize-none focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                        />
                        <button
                            onClick={handleSend}
                            disabled={!input.trim() || isLoading}
                            className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-medium rounded-xl hover:from-indigo-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                            Send
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
