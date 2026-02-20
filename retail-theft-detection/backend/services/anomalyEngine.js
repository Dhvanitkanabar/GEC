/**
 * Anomaly Detection Engine — 8-Type Software Theft Detection
 * Treats the POS log as an UNTRUSTED input and cross-references with camera data.
 * 
 * Anomaly Types:
 * 1. Unauthorized Drawer Open Commands
 * 2. Phantom Transactions
 * 3. Void/Refund as Cover
 * 4. Discount & Override Abuse
 * 5. Log Tampering / Deletion
 * 6. Drawer Open Without Transaction
 * 7. Time Manipulation
 * 8. Cross-Source Correlation (Video ↔ POS)
 */

const HashChain = require('./hashChain');

class AnomalyEngine {
    constructor(db) {
        this.db = db;
    }

    /**
     * Run a full anomaly scan across all 8 categories
     * @param {number} hoursBack - How many hours to look back
     * @returns {Object} Full anomaly report
     */
    fullScan(hoursBack = 24) {
        const since = new Date(Date.now() - hoursBack * 3600000).toISOString();

        const results = {
            scan_timestamp: new Date().toISOString(),
            period_hours: hoursBack,
            anomalies: [],
            summary: {},
            prosecution_score: 0,
        };

        // Run all 8 detectors
        const detectors = [
            this.detectUnauthorizedDrawerOpen(since),
            this.detectPhantomTransactions(since),
            this.detectVoidRefundCover(since),
            this.detectDiscountAbuse(since),
            this.detectLogTampering(),
            this.detectDrawerNoTransaction(since),
            this.detectTimeManipulation(since),
            this.detectCrossSourceCorrelation(since),
        ];

        const categories = [
            'unauthorized_drawer_open',
            'phantom_transaction',
            'void_refund_cover',
            'discount_abuse',
            'log_tampering',
            'drawer_no_transaction',
            'time_manipulation',
            'cross_source_correlation',
        ];

        const categoryLabels = [
            'Unauthorized Drawer Open',
            'Phantom Transactions',
            'Void/Refund as Cover',
            'Discount & Override Abuse',
            'Log Tampering / Deletion',
            'Drawer Open Without Transaction',
            'Time Manipulation',
            'Cross-Source Correlation',
        ];

        const categoryIcons = ['🔓', '👻', '🔄', '💸', '🛡️', '📭', '⏰', '🔗'];

        let totalScore = 0;
        let totalAnomalies = 0;

        for (let i = 0; i < detectors.length; i++) {
            const detected = detectors[i];
            results.summary[categories[i]] = {
                label: categoryLabels[i],
                icon: categoryIcons[i],
                count: detected.length,
                severity: this._categorySeverity(detected),
                items: detected,
            };
            totalAnomalies += detected.length;
            for (const d of detected) {
                d.category = categories[i];
                d.category_label = categoryLabels[i];
                d.category_icon = categoryIcons[i];
                results.anomalies.push(d);
                totalScore += d.confidence * (d.risk_weight || 10);
            }
        }

        results.total_anomalies = totalAnomalies;
        results.prosecution_score = Math.min(100, Math.round(totalScore));

        return results;
    }

    // ═══════════════════════════════════════════════════════════
    // 1. UNAUTHORIZED DRAWER OPEN COMMANDS
    // Drawer opened without a matching completed sale
    // ═══════════════════════════════════════════════════════════
    detectUnauthorizedDrawerOpen(since) {
        const anomalies = [];

        // Find drawer_opened log entries
        const drawerEvents = this.db.prepare(`
            SELECT tl.*, u.full_name as cashier_name 
            FROM transaction_log tl 
            LEFT JOIN users u ON tl.performed_by = u.id
            WHERE tl.action = 'drawer_opened' AND tl.timestamp >= ?
            ORDER BY tl.timestamp DESC
        `).all(since);

        for (const evt of drawerEvents) {
            // Check if there's a corresponding completed cash payment
            const matchingPayment = this.db.prepare(`
                SELECT id FROM transaction_log 
                WHERE transaction_id = ? AND action = 'cash_payment'
                AND timestamp <= ? AND timestamp >= datetime(?, '-5 minutes')
            `).get(evt.transaction_id, evt.timestamp, evt.timestamp);

            if (!matchingPayment) {
                anomalies.push({
                    id: evt.id,
                    timestamp: evt.timestamp,
                    cashier: evt.cashier_name || 'Unknown',
                    cashier_id: evt.performed_by,
                    description: `Drawer opened without matching cash payment`,
                    transaction_id: evt.transaction_id,
                    confidence: 0.85,
                    risk_weight: 20,
                    severity: 'high',
                    details: JSON.parse(evt.details || '{}'),
                });
            }
        }

        // Also check for forced drawer alerts
        const forcedAlerts = this.db.prepare(`
            SELECT a.*, u.full_name as cashier_name 
            FROM alerts a LEFT JOIN users u ON a.cashier_id = u.id
            WHERE a.source = 'drawer' AND a.severity = 'critical' AND a.created_at >= ?
        `).all(since);

        for (const alert of forcedAlerts) {
            anomalies.push({
                id: alert.id,
                timestamp: alert.created_at,
                cashier: alert.cashier_name || 'Unknown',
                cashier_id: alert.cashier_id,
                description: alert.description,
                confidence: 0.95,
                risk_weight: 25,
                severity: 'critical',
            });
        }

        return anomalies;
    }

    // ═══════════════════════════════════════════════════════════
    // 2. PHANTOM TRANSACTIONS
    // Sale logged but no customer visible in camera feed
    // ═══════════════════════════════════════════════════════════
    detectPhantomTransactions(since) {
        const anomalies = [];

        // Find completed transactions
        const transactions = this.db.prepare(`
            SELECT t.*, u.full_name as cashier_name 
            FROM transactions t JOIN users u ON t.cashier_id = u.id
            WHERE t.status = 'completed' AND t.completed_at >= ?
            ORDER BY t.completed_at DESC
        `).all(since);

        for (const txn of transactions) {
            // Check for customer_present camera event within ±3 minutes
            const customerPresent = this.db.prepare(`
                SELECT id FROM camera_events 
                WHERE event_type = 'customer_present' 
                AND counter_id = ?
                AND timestamp BETWEEN datetime(?, '-3 minutes') AND datetime(?, '+3 minutes')
            `).get(txn.counter_id, txn.completed_at, txn.completed_at);

            if (!customerPresent && txn.payment_method === 'cash') {
                anomalies.push({
                    id: txn.id,
                    timestamp: txn.completed_at,
                    cashier: txn.cashier_name,
                    cashier_id: txn.cashier_id,
                    description: `Cash sale ($${txn.total}) with no customer detected at ${txn.counter_id}`,
                    transaction_id: txn.id,
                    amount: txn.total,
                    confidence: 0.75,
                    risk_weight: 20,
                    severity: 'high',
                });
            }
        }

        return anomalies;
    }

    // ═══════════════════════════════════════════════════════════
    // 3. VOID/REFUND AS COVER
    // Void/refund shortly after sale, especially after customer left
    // ═══════════════════════════════════════════════════════════
    detectVoidRefundCover(since) {
        const anomalies = [];

        // Find voided or refunded transactions
        const voidedTxns = this.db.prepare(`
            SELECT t.*, u.full_name as cashier_name,
            (SELECT tl.timestamp FROM transaction_log tl 
             WHERE tl.transaction_id = t.id AND tl.action = 'completed' LIMIT 1) as completed_time
            FROM transactions t JOIN users u ON t.cashier_id = u.id
            WHERE t.status IN ('voided', 'refunded') AND t.created_at >= ?
            ORDER BY t.created_at DESC
        `).all(since);

        for (const txn of voidedTxns) {
            const voidTime = txn.voided_at || txn.refunded_at;
            const completedTime = txn.completed_time;

            if (completedTime && voidTime) {
                const gapMs = new Date(voidTime) - new Date(completedTime);
                const gapMinutes = gapMs / 60000;

                // Suspicious if voided within 10 minutes of completion
                if (gapMinutes <= 10 && gapMinutes >= 0) {
                    const conf = gapMinutes <= 2 ? 0.95 : gapMinutes <= 5 ? 0.80 : 0.65;
                    anomalies.push({
                        id: txn.id,
                        timestamp: voidTime,
                        cashier: txn.cashier_name,
                        cashier_id: txn.cashier_id,
                        description: `${txn.status === 'voided' ? 'Void' : 'Refund'} issued ${gapMinutes.toFixed(0)}min after completion ($${txn.total})`,
                        transaction_id: txn.id,
                        amount: txn.total,
                        gap_minutes: gapMinutes,
                        confidence: conf,
                        risk_weight: 20,
                        severity: conf >= 0.8 ? 'critical' : 'high',
                    });
                }
            }
        }

        return anomalies;
    }

    // ═══════════════════════════════════════════════════════════
    // 4. DISCOUNT & OVERRIDE ABUSE
    // Statistical outlier detection on discount patterns
    // ═══════════════════════════════════════════════════════════
    detectDiscountAbuse(since) {
        const anomalies = [];

        // Find cashiers with discount/override actions
        const cashiers = this.db.prepare("SELECT id, full_name FROM users WHERE role = 'cashier'").all();

        // Get average discount rate across all cashiers
        const avgDiscounts = this.db.prepare(`
            SELECT performed_by, COUNT(*) as discount_count 
            FROM transaction_log 
            WHERE action IN ('price_edited', 'discount_applied') AND timestamp >= ?
            GROUP BY performed_by
        `).all(since);

        const totalDiscounts = avgDiscounts.reduce((sum, d) => sum + d.discount_count, 0);
        const avgPerCashier = cashiers.length > 0 ? totalDiscounts / cashiers.length : 0;

        for (const d of avgDiscounts) {
            const cashier = cashiers.find(c => c.id === d.performed_by);
            if (d.discount_count > avgPerCashier * 2 && d.discount_count >= 3) {
                anomalies.push({
                    id: d.performed_by,
                    timestamp: since,
                    cashier: cashier?.full_name || 'Unknown',
                    cashier_id: d.performed_by,
                    description: `${d.discount_count} discounts/overrides (${(d.discount_count / (avgPerCashier || 1) * 100).toFixed(0)}% above average)`,
                    count: d.discount_count,
                    average: avgPerCashier,
                    confidence: Math.min(0.95, 0.5 + (d.discount_count / (avgPerCashier || 1)) * 0.1),
                    risk_weight: 12,
                    severity: d.discount_count > avgPerCashier * 5 ? 'critical' : 'medium',
                });
            }
        }

        return anomalies;
    }

    // ═══════════════════════════════════════════════════════════
    // 5. LOG TAMPERING / DELETION
    // Hash chain validation and timestamp gap detection
    // ═══════════════════════════════════════════════════════════
    detectLogTampering() {
        const anomalies = [];

        // Verify hash chain integrity
        const logs = this.db.prepare('SELECT * FROM transaction_log ORDER BY id ASC').all();

        if (logs.length > 0) {
            const chainResult = HashChain.verifyChain(logs);
            if (!chainResult.valid) {
                anomalies.push({
                    id: `chain_break_${chainResult.brokenAt}`,
                    timestamp: new Date().toISOString(),
                    cashier: 'SYSTEM',
                    description: `Hash chain integrity BROKEN at log entry #${chainResult.brokenAt}. ${chainResult.reason || 'Hash mismatch detected.'}`,
                    confidence: 1.0,
                    risk_weight: 50,
                    severity: 'critical',
                });
            }

            // Detect timestamp gaps > 30 minutes during business hours (8am-10pm)
            for (let i = 1; i < logs.length; i++) {
                const prev = new Date(logs[i - 1].timestamp);
                const curr = new Date(logs[i].timestamp);
                const gapMinutes = (curr - prev) / 60000;

                const hour = prev.getHours();
                if (gapMinutes > 30 && hour >= 8 && hour <= 22) {
                    anomalies.push({
                        id: `gap_${logs[i].id}`,
                        timestamp: logs[i].timestamp,
                        cashier: 'SYSTEM',
                        description: `${gapMinutes.toFixed(0)}-minute gap in audit log (possible deletion)`,
                        gap_minutes: gapMinutes,
                        confidence: Math.min(0.95, 0.5 + gapMinutes / 120),
                        risk_weight: 30,
                        severity: gapMinutes > 60 ? 'critical' : 'high',
                    });
                }
            }
        }

        // Check entry count continuity (sequential IDs)
        const idGaps = this.db.prepare(`
            SELECT a.id as prev_id, b.id as next_id 
            FROM transaction_log a, transaction_log b 
            WHERE b.id = a.id + 2 AND NOT EXISTS (
                SELECT 1 FROM transaction_log c WHERE c.id = a.id + 1
            ) LIMIT 10
        `).all();

        for (const gap of idGaps) {
            anomalies.push({
                id: `id_gap_${gap.prev_id}`,
                timestamp: new Date().toISOString(),
                cashier: 'SYSTEM',
                description: `Missing log entry between #${gap.prev_id} and #${gap.next_id} (possible deletion)`,
                confidence: 0.90,
                risk_weight: 40,
                severity: 'critical',
            });
        }

        return anomalies;
    }

    // ═══════════════════════════════════════════════════════════
    // 6. DRAWER OPEN WITHOUT ANY TRANSACTION TYPE
    // Drawer command with NULL/undefined transaction reference
    // ═══════════════════════════════════════════════════════════
    detectDrawerNoTransaction(since) {
        const anomalies = [];

        // Camera events where drawer opened without POS command
        const drawerEvents = this.db.prepare(`
            SELECT ce.*, u.full_name as cashier_name 
            FROM camera_events ce LEFT JOIN users u ON ce.cashier_id = u.id
            WHERE ce.event_type IN ('drawer_opened_no_pos', 'drawer_forced_open')
            AND ce.timestamp >= ?
        `).all(since);

        for (const evt of drawerEvents) {
            // Check for any transaction within ±2 minutes
            const matchingTxn = this.db.prepare(`
                SELECT id FROM transactions 
                WHERE counter_id = ?
                AND status = 'completed'
                AND completed_at BETWEEN datetime(?, '-2 minutes') AND datetime(?, '+2 minutes')
            `).get(evt.counter_id, evt.timestamp, evt.timestamp);

            anomalies.push({
                id: evt.id,
                timestamp: evt.timestamp,
                cashier: evt.cashier_name || 'Unknown',
                cashier_id: evt.cashier_id,
                description: matchingTxn
                    ? `Drawer opened by non-standard method (camera detected, but transaction exists)`
                    : `Drawer opened with NO linked transaction — ${evt.description}`,
                transaction_id: matchingTxn?.id || null,
                confidence: matchingTxn ? 0.5 : evt.confidence,
                risk_weight: matchingTxn ? 10 : 25,
                severity: matchingTxn ? 'medium' : 'high',
            });
        }

        return anomalies;
    }

    // ═══════════════════════════════════════════════════════════
    // 7. TIME MANIPULATION
    // Clock drift between POS timestamps and reference time
    // ═══════════════════════════════════════════════════════════
    detectTimeManipulation(since) {
        const anomalies = [];
        const now = Date.now();

        // Check for transactions with future timestamps
        const futureTxns = this.db.prepare(`
            SELECT t.*, u.full_name as cashier_name 
            FROM transactions t JOIN users u ON t.cashier_id = u.id
            WHERE t.created_at > ? AND t.created_at >= ?
        `).all(new Date(now + 60000).toISOString(), since);

        for (const txn of futureTxns) {
            const drift = (new Date(txn.created_at) - now) / 60000;
            anomalies.push({
                id: txn.id,
                timestamp: txn.created_at,
                cashier: txn.cashier_name,
                cashier_id: txn.cashier_id,
                description: `Transaction timestamp ${drift.toFixed(0)} minutes in the future — possible clock manipulation`,
                drift_minutes: drift,
                confidence: 0.90,
                risk_weight: 30,
                severity: 'critical',
            });
        }

        // Check for out-of-sequence timestamps in logs
        const outOfOrder = this.db.prepare(`
            SELECT a.id as entry_id, a.timestamp as ts1, b.timestamp as ts2,
                   u.full_name as cashier_name, a.performed_by
            FROM transaction_log a 
            JOIN transaction_log b ON b.id = a.id + 1
            LEFT JOIN users u ON a.performed_by = u.id
            WHERE a.timestamp > b.timestamp AND a.timestamp >= ?
            LIMIT 10
        `).all(since);

        for (const o of outOfOrder) {
            anomalies.push({
                id: `ooo_${o.entry_id}`,
                timestamp: o.ts1,
                cashier: o.cashier_name || 'Unknown',
                cashier_id: o.performed_by,
                description: `Out-of-order timestamps: entry #${o.entry_id} (${o.ts1}) is after #${o.entry_id + 1} (${o.ts2})`,
                confidence: 0.85,
                risk_weight: 25,
                severity: 'high',
            });
        }

        return anomalies;
    }

    // ═══════════════════════════════════════════════════════════
    // 8. CROSS-SOURCE CORRELATION
    // Bidirectional Video ↔ POS Log mismatch detection
    // ═══════════════════════════════════════════════════════════
    detectCrossSourceCorrelation(since) {
        const anomalies = [];

        // Case A: POS says nothing happened, but camera shows activity
        const suspiciousCameraEvents = this.db.prepare(`
            SELECT ce.*, u.full_name as cashier_name 
            FROM camera_events ce LEFT JOIN users u ON ce.cashier_id = u.id
            WHERE ce.event_type IN ('hand_to_pocket', 'suspicious_gesture', 'drawer_forced_open') 
            AND ce.timestamp >= ?
        `).all(since);

        for (const evt of suspiciousCameraEvents) {
            // Check if any POS log entry exists near this time
            const posActivity = this.db.prepare(`
                SELECT COUNT(*) as c FROM transaction_log 
                WHERE performed_by = ?
                AND timestamp BETWEEN datetime(?, '-5 minutes') AND datetime(?, '+5 minutes')
            `).get(evt.cashier_id, evt.timestamp, evt.timestamp);

            if (posActivity.c === 0) {
                anomalies.push({
                    id: `cs_cam_${evt.id}`,
                    timestamp: evt.timestamp,
                    cashier: evt.cashier_name || 'Unknown',
                    cashier_id: evt.cashier_id,
                    description: `Camera detected "${evt.event_type.replace(/_/g, ' ')}" but NO POS activity logged nearby`,
                    source: 'camera_only',
                    camera_event: evt.event_type,
                    confidence: evt.confidence * 0.9,
                    risk_weight: 20,
                    severity: evt.event_type === 'drawer_forced_open' ? 'critical' : 'high',
                });
            }
        }

        // Case B: POS logged a void but camera shows customer had already left
        const voidLogs = this.db.prepare(`
            SELECT tl.*, u.full_name as cashier_name, t.counter_id
            FROM transaction_log tl 
            JOIN users u ON tl.performed_by = u.id
            JOIN transactions t ON tl.transaction_id = t.id
            WHERE tl.action IN ('voided', 'refunded') AND tl.timestamp >= ?
        `).all(since);

        for (const vl of voidLogs) {
            // Check if a customer was present at void time
            const customerPresent = this.db.prepare(`
                SELECT id FROM camera_events 
                WHERE event_type = 'customer_present' AND counter_id = ?
                AND timestamp BETWEEN datetime(?, '-2 minutes') AND datetime(?, '+2 minutes')
            `).get(vl.counter_id, vl.timestamp, vl.timestamp);

            if (!customerPresent) {
                anomalies.push({
                    id: `cs_void_${vl.id}`,
                    timestamp: vl.timestamp,
                    cashier: vl.cashier_name,
                    cashier_id: vl.performed_by,
                    description: `${vl.action} logged but NO customer present at counter during void — irrefutable evidence pattern`,
                    source: 'pos_void_no_customer',
                    transaction_id: vl.transaction_id,
                    confidence: 0.95,
                    risk_weight: 25,
                    severity: 'critical',
                });
            }
        }

        return anomalies;
    }

    // ─── Helpers ──────────────────────────────────────────────
    _categorySeverity(items) {
        if (items.some(i => i.severity === 'critical')) return 'critical';
        if (items.some(i => i.severity === 'high')) return 'high';
        if (items.some(i => i.severity === 'medium')) return 'medium';
        return items.length > 0 ? 'low' : 'clear';
    }

    /**
     * Get integrity report for the hash chain
     */
    integrityReport() {
        const logs = this.db.prepare('SELECT * FROM transaction_log ORDER BY id ASC').all();
        const chainResult = HashChain.verifyChain(logs);
        return {
            total_entries: logs.length,
            ...chainResult,
            checked_at: new Date().toISOString(),
        };
    }
}

module.exports = AnomalyEngine;
