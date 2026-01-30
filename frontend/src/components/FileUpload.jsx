import { useState, useRef } from 'react';

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
            className={`
        border-2 border-dashed rounded-xl p-6 text-center cursor-pointer
        transition-all duration-300
        ${isDragging
                    ? 'border-indigo-500 bg-indigo-500/10'
                    : 'border-white/20 hover:border-indigo-400 hover:bg-white/5'
                }
        ${isUploading ? 'pointer-events-none opacity-50' : ''}
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
                <div className="flex flex-col items-center">
                    <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-2" />
                    <p className="text-slate-400">Uploading...</p>
                </div>
            ) : (
                <>
                    <svg
                        className="w-10 h-10 mx-auto mb-3 text-indigo-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                        />
                    </svg>
                    <p className="text-slate-300 font-medium">
                        Drop a PDF here or click to upload
                    </p>
                    <p className="text-slate-500 text-sm mt-1">
                        Documents will be added to your knowledge base
                    </p>
                </>
            )}
        </div>
    );
}
