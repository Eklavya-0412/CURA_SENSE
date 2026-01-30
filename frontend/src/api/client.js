/**
 * API Client for communicating with the FastAPI backend
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/**
 * Send a chat message to the AI
 */
export async function sendMessage(message, collectionName = 'default', useRag = true) {
    const response = await fetch(`${API_BASE_URL}/chat/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            message,
            collection_name: collectionName,
            use_rag: useRag,
        }),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to send message');
    }

    return response.json();
}

/**
 * Clear chat history
 */
export async function clearChatHistory() {
    const response = await fetch(`${API_BASE_URL}/chat/clear-history`, {
        method: 'POST',
    });

    if (!response.ok) {
        throw new Error('Failed to clear chat history');
    }

    return response.json();
}

/**
 * Upload a PDF file
 */
export async function uploadPdf(file, collectionName = 'default') {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('collection_name', collectionName);

    const response = await fetch(`${API_BASE_URL}/documents/upload-pdf`, {
        method: 'POST',
        body: formData,
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to upload PDF');
    }

    return response.json();
}

/**
 * Ingest raw text
 */
export async function ingestText(text, metadata = null, collectionName = 'default') {
    const response = await fetch(`${API_BASE_URL}/documents/ingest-text`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            text,
            metadata,
            collection_name: collectionName,
        }),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to ingest text');
    }

    return response.json();
}

/**
 * List all collections
 */
export async function listCollections() {
    const response = await fetch(`${API_BASE_URL}/documents/collections`);

    if (!response.ok) {
        throw new Error('Failed to list collections');
    }

    return response.json();
}

/**
 * Delete a collection
 */
export async function deleteCollection(collectionName) {
    const response = await fetch(`${API_BASE_URL}/documents/collections/${collectionName}`, {
        method: 'DELETE',
    });

    if (!response.ok) {
        throw new Error('Failed to delete collection');
    }

    return response.json();
}

/**
 * Health check
 */
export async function healthCheck() {
    const response = await fetch(`${API_BASE_URL}/health`);
    return response.json();
}
