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

// ============ AGENT API ============

/**
 * Analyze tickets and errors
 */
export async function analyzeIssues(tickets = [], errors = []) {
    const response = await fetch(`${API_BASE_URL}/agent/analyze`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            tickets,
            errors
        }),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to analyze issues');
    }

    return response.json();
}

/**
 * Get approval queue
 */
export async function getApprovalQueue() {
    const response = await fetch(`${API_BASE_URL}/agent/queue`);

    if (!response.ok) {
        throw new Error('Failed to get approval queue');
    }

    return response.json();
}

/**
 * Approve or reject an action
 */
export async function approveAction(decision) {
    const response = await fetch(`${API_BASE_URL}/agent/approve`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(decision),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to process approval');
    }

    return response.json();
}

/**
 * Get session history
 */
export async function getSessionHistory(limit = 10) {
    const response = await fetch(`${API_BASE_URL}/agent/history?limit=${limit}`);

    if (!response.ok) {
        throw new Error('Failed to get session history');
    }

    return response.json();
}

/**
 * Get agent metrics
 */
export async function getAgentMetrics() {
    const response = await fetch(`${API_BASE_URL}/agent/metrics`);

    if (!response.ok) {
        throw new Error('Failed to get metrics');
    }

    return response.json();
}

/**
 * Get analytics data
 */
export async function getAnalytics() {
    const response = await fetch(`${API_BASE_URL}/agent/analytics`);

    if (!response.ok) {
        throw new Error('Failed to get analytics');
    }

    return response.json();
}

// ============ CLIENT/MERCHANT API ============

/**
 * Submit a support issue from the merchant portal
 * @param {string} message - The support issue description
 * @param {string} merchantId - The merchant's ID
 * @returns {Promise<{session_id: string, status: string}>}
 */
export async function submitSupportIssue(message, merchantId = 'unknown') {
    const response = await fetch(`${API_BASE_URL}/agent/submit`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            message,
            merchant_id: merchantId
        }),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to submit support issue');
    }

    return response.json();
}

/**
 * Poll for resolution status from the merchant portal
 * @param {string} sessionId - The session ID returned from submitSupportIssue
 * @returns {Promise<{status: string, message?: string, response?: string}>}
 */
export async function pollForResolution(sessionId) {
    const response = await fetch(`${API_BASE_URL}/agent/client/poll/${sessionId}`);

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to check resolution status');
    }

    return response.json();
}
