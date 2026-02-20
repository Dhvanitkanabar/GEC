/**
 * API Service — Enhanced
 * Centralized client for all backend + CV service communication
 */

const API_BASE = '/api';
const CV_BASE = 'http://localhost:5001/api/cv';

let authToken = sessionStorage.getItem('auth_token');
let currentUser = JSON.parse(sessionStorage.getItem('auth_user') || 'null');

async function request(path, options = {}) {
    const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
    const headers = { 'Content-Type': 'application/json', ...options.headers };

    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) {
        sessionStorage.removeItem('auth_token');
        sessionStorage.removeItem('auth_user');
        window.location.reload();
        throw new Error('Unauthorized');
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
}

const api = {
    // ─── Auth ────────────────────────────────────────────
    async login(username, password) {
        const data = await request('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
        authToken = data.token;
        const user = { id: data.id, username: data.username, role: data.role, full_name: data.full_name };
        currentUser = user;
        sessionStorage.setItem('auth_token', data.token);
        sessionStorage.setItem('auth_user', JSON.stringify(user));
        return user;
    },
    logout() {
        authToken = null;
        currentUser = null;
        sessionStorage.removeItem('auth_token');
        sessionStorage.removeItem('auth_user');
    },
    getUser() { return currentUser; },

    // ─── POS Products ────────────────────────────────────
    async getProducts() { return request('/pos/products'); },

    // ─── POS Transactions ────────────────────────────────
    async createTransaction() {
        return request('/pos/transactions', { method: 'POST' });
    },
    async getTransactions(filters = {}) {
        const params = new URLSearchParams(filters).toString();
        return request(`/pos/transactions?${params}`);
    },
    async getTransaction(id) { return request(`/pos/transactions/${id}`); },
    async addItem(txnId, product_id, quantity) {
        return request(`/pos/transactions/${txnId}/items`, {
            method: 'POST', body: JSON.stringify({ product_id, quantity })
        });
    },
    async removeItem(txnId, itemId) {
        return request(`/pos/transactions/${txnId}/items/${itemId}`, { method: 'DELETE' });
    },

    // ─── Cash Payment (enhanced flow) ────────────────────
    async cashPayment(txnId, cash_received, customer_verified) {
        return request(`/pos/transactions/${txnId}/cash-payment`, {
            method: 'POST',
            body: JSON.stringify({ cash_received, customer_verified })
        });
    },
    async onlinePayment(txnId) {
        return request(`/pos/transactions/${txnId}/online-payment`, { method: 'POST' });
    },

    // ─── Drawer ──────────────────────────────────────────
    async getDrawerBalance(counter_id) {
        const params = counter_id ? `?counter_id=${counter_id}` : '';
        return request(`/pos/drawer-balance${params}`);
    },
    async getDrawerEntries(filters = {}) {
        const params = new URLSearchParams(filters).toString();
        return request(`/pos/drawer-entries?${params}`);
    },
    async reportForcedDrawer(counter_id, cashier_id, description) {
        return request('/pos/drawer/forced', {
            method: 'POST',
            body: JSON.stringify({ counter_id, cashier_id, description })
        });
    },

    // ─── Camera ──────────────────────────────────────────
    async checkCustomerPresence(counter_id) {
        return request(`/camera/customer-check?counter_id=${counter_id || ''}`);
    },
    async getCameraEvents(filters = {}) {
        const params = new URLSearchParams(filters).toString();
        return request(`/camera/events?${params}`);
    },

    // ─── Alerts ──────────────────────────────────────────
    async getAlerts(filters = {}) {
        const params = new URLSearchParams(filters).toString();
        return request(`/alerts?${params}`);
    },
    async getUnacknowledgedAlerts() { return request('/alerts/unacknowledged'); },
    async acknowledgeAlert(id) {
        return request(`/alerts/${id}/acknowledge`, { method: 'POST' });
    },
    async getAlertStats() { return request('/alerts/stats'); },

    // ─── Reports ─────────────────────────────────────────
    async getDashboardStats() { return request('/reports/dashboard-stats'); },
    async getDrawerSummary() { return request('/reports/drawer-summary'); },
    async getRiskScores(hours = 24) { return request(`/reports/risk-scores?hours=${hours}`); },
    async getTimeline(limit = 50) { return request(`/reports/timeline?limit=${limit}`); },
    async exportData() { return request('/reports/export'); },

    // ─── Audit ───────────────────────────────────────────
    async getAuditLog(filters = {}) {
        const params = new URLSearchParams(filters).toString();
        return request(`/pos/audit-log?${params}`);
    },
    async verifyChain() { return request('/pos/verify-chain'); },

    // ─── Anomaly Detection ───────────────────────────────
    async scanAnomalies(hours = 24) { return request(`/anomalies/scan?hours=${hours}`); },
    async getAnomalyStats(hours = 24) { return request(`/anomalies/stats?hours=${hours}`); },
    async checkIntegrity() { return request('/anomalies/integrity'); },

    // ─── CV Service ──────────────────────────────────────
    cvFeedUrl: `${CV_BASE}/feed`,
    async cvStart(simulate = false) {
        return request(`${CV_BASE}/start`, {
            method: 'POST',
            body: JSON.stringify({ simulate })
        });
    },
    async cvStop() { return request(`${CV_BASE}/stop`, { method: 'POST' }); },
    async cvStatus() {
        try { return await request(`${CV_BASE}/status`); }
        catch { return null; }
    },
};

export default api;
