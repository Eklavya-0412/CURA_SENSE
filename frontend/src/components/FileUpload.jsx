import { useState, useRef } from 'react';
import { UploadCloud, Loader2 } from 'lucide-react';

/**
 * File upload component for PDF documents
 */
export default function FileUpload({ onUpload, isUploading }) {
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef(null);

    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => {
        setIsDragging(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        if (file && file.type === 'application/pdf') {
            onUpload(file);
        }
    };

    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        if (file) {
            onUpload(file);
        }
    };

    return (
        <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
            className={`
        border border-dashed rounded-xl px-6 py-6 text-center cursor-pointer transition-colors
        ${isDragging
                    ? 'border-accent bg-accent/10'
                    : 'border-line-strong bg-surface hover:border-accent/60 hover:bg-surface-2'
                }
        ${isUploading ? 'pointer-events-none opacity-60' : ''}
      `}
        >
            <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                onChange={handleFileSelect}
                className="hidden"
            />

            {isUploading ? (
                <div className="flex flex-col items-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin text-accent" />
                    <p className="t-small text-fg-muted">Uploading…</p>
                </div>
            ) : (
                <div className="flex flex-col items-center">
                    <div className="w-9 h-9 rounded-lg bg-surface-3 text-fg-muted flex items-center justify-center mb-3">
                        <UploadCloud className="w-[18px] h-[18px]" />
                    </div>
                    <p className="t-h3">Drop a PDF here or click to upload</p>
                    <p className="t-meta mt-1">Documents are added to the troubleshooting knowledge base</p>
                </div>
            )}
        </div>
    );
}
