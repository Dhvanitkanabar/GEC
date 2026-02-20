/**
 * SHA-256 Hash Chain Service
 * Provides tamper-proof integrity for append-only transaction logs
 */
const crypto = require('crypto');

class HashChain {
    /**
     * Generate SHA-256 hash for a transaction log entry
     * @param {Object} entry - Log entry data
     * @param {string|null} prevHash - Hash of previous entry in chain
     * @returns {string} SHA-256 hex digest
     */
    static generateHash(entry, prevHash = null) {
        const data = JSON.stringify({
            transaction_id: entry.transaction_id,
            action: entry.action,
            performed_by: entry.performed_by,
            details: entry.details,
            timestamp: entry.timestamp,
            prev_hash: prevHash
        });
        return crypto.createHash('sha256').update(data).digest('hex');
    }

    /**
     * Generate hash for a transaction record
     */
    static hashTransaction(txn) {
        const data = JSON.stringify({
            id: txn.id,
            cashier_id: txn.cashier_id,
            subtotal: txn.subtotal,
            tax: txn.tax,
            total: txn.total,
            status: txn.status,
            created_at: txn.created_at
        });
        return crypto.createHash('sha256').update(data).digest('hex');
    }

    /**
     * Verify the integrity of the entire hash chain
     * @param {Array} logs - Array of log entries ordered by id ASC
     * @returns {Object} { valid: boolean, brokenAt: number|null }
     */
    static verifyChain(logs) {
        for (let i = 0; i < logs.length; i++) {
            const entry = logs[i];
            const prevHash = i > 0 ? logs[i - 1].hash : null;
            const computed = this.generateHash(entry, prevHash);

            if (computed !== entry.hash) {
                return { valid: false, brokenAt: entry.id, expected: computed, actual: entry.hash };
            }
            if (entry.prev_hash !== prevHash) {
                return { valid: false, brokenAt: entry.id, reason: 'prev_hash mismatch' };
            }
        }
        return { valid: true, brokenAt: null };
    }
}

module.exports = HashChain;
