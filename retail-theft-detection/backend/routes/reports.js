/**
 * Reports Routes — Enhanced
 * Drawer summary, risk scores, dashboard stats, exports
 */
const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');

module.exports = function (db) {
    const router = express.Router();

    // ─── GET /api/reports/dashboard-stats — summary stats ──
    router.get('/dashboard-stats', authenticate, (req, res) => {
        try {
            const today = new Date().toISOString().split('T')[0];
            const stats = {};

            if (req.user.role === 'cashier') {
                // Cashier only sees their own stats
                stats.today_transactions = db.prepare(
                    'SELECT COUNT(*) as c FROM transactions WHERE cashier_id = ? AND created_at >= ?'
                ).get(req.user.id, today).c;
                stats.today_revenue = db.prepare(
                    'SELECT COALESCE(SUM(total), 0) as t FROM transactions WHERE cashier_id = ? AND status = \'completed\' AND created_at >= ?'
                ).get(req.user.id, today).t;
                stats.pending_transactions = db.prepare(
                    'SELECT COUNT(*) as c FROM transactions WHERE cashier_id = ? AND status = \'open\''
                ).get(req.user.id).c;
            } else {
                // Manager/Admin sees everything
                stats.total_transactions = db.prepare(
                    'SELECT COUNT(*) as c FROM transactions WHERE created_at >= ?'
                ).get(today).c;
                stats.today_transactions = stats.total_transactions;
                stats.today_revenue = db.prepare(
                    'SELECT COALESCE(SUM(total), 0) as t FROM transactions WHERE status = \'completed\' AND created_at >= ?'
                ).get(today).t;
                stats.unacknowledged_alerts = db.prepare(
                    'SELECT COUNT(*) as c FROM alerts WHERE acknowledged = 0'
                ).get().c;
                stats.high_risk_transactions = db.prepare(
                    'SELECT COUNT(*) as c FROM transactions WHERE risk_score >= 50 AND created_at >= ?'
                ).get(today).c;
                stats.suspicious_camera_events = db.prepare(
                    `SELECT COUNT(*) as c FROM camera_events WHERE event_type IN ('hand_to_pocket','drawer_forced_open','suspicious_gesture')
           AND timestamp >= ?`
                ).get(today).c;
                stats.total_drawer_balance = db.prepare(
                    'SELECT COALESCE(SUM(current_balance), 0) as t FROM drawer_balance'
                ).get().t;
            }

            res.json(stats);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ─── GET /api/reports/drawer-summary — end-of-day summary (manager)
    router.get('/drawer-summary', authenticate, authorize('manager', 'admin'), (req, res) => {
        try {
            const today = new Date().toISOString().split('T')[0];

            // All counter balances
            const balances = db.prepare('SELECT * FROM drawer_balance ORDER BY counter_id').all();

            // Today's entries per counter
            const entries = db.prepare(`
        SELECT de.*, u.full_name as cashier_name FROM drawer_entries de
        LEFT JOIN users u ON de.cashier_id = u.id
        WHERE de.timestamp >= ? ORDER BY de.timestamp DESC
      `).all(today);

            // Totals
            const totalCashIn = db.prepare(
                'SELECT COALESCE(SUM(amount), 0) as t FROM drawer_entries WHERE entry_type = \'cash_in\' AND timestamp >= ?'
            ).get(today).t;
            const totalChangeOut = db.prepare(
                'SELECT COALESCE(SUM(ABS(amount)), 0) as t FROM drawer_entries WHERE entry_type = \'change_out\' AND timestamp >= ?'
            ).get(today).t;
            const completedTransactions = db.prepare(
                'SELECT COUNT(*) as c, COALESCE(SUM(total), 0) as t FROM transactions WHERE status = \'completed\' AND payment_method = \'cash\' AND completed_at >= ?'
            ).get(today);

            res.json({
                balances,
                entries,
                summary: {
                    total_cash_in: totalCashIn,
                    total_change_out: totalChangeOut,
                    net_cash: Math.round((totalCashIn - totalChangeOut) * 100) / 100,
                    cash_transactions: completedTransactions.c,
                    cash_revenue: completedTransactions.t,
                }
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ─── GET /api/reports/risk-scores — per-cashier risk scores (manager)
    router.get('/risk-scores', authenticate, authorize('manager', 'admin'), (req, res) => {
        try {
            const hours = parseInt(req.query.hours) || 24;
            const cashiers = db.prepare("SELECT id, full_name FROM users WHERE role = 'cashier'").all();
            const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();

            const results = cashiers.map(c => {
                const swEvents = db.prepare(
                    "SELECT COUNT(*) as c FROM transaction_log WHERE performed_by = ? AND timestamp >= ? AND action IN ('voided', 'refunded', 'price_edited')"
                ).get(c.id, since);
                const phEvents = db.prepare(
                    "SELECT COUNT(*) as c FROM camera_events WHERE cashier_id = ? AND timestamp >= ? AND event_type != 'normal'"
                ).get(c.id, since);

                return {
                    cashier_name: c.full_name,
                    cashier_id: c.id,
                    software_score: Math.min(100, (swEvents.c || 0) * 15),
                    physical_score: Math.min(100, (phEvents.c || 0) * 12),
                    combined_score: Math.min(100, (swEvents.c || 0) * 15 + (phEvents.c || 0) * 12),
                    sw_event_count: swEvents.c || 0,
                    ph_event_count: phEvents.c || 0,
                    period_hours: hours,
                };
            });

            res.json(results);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ─── GET /api/reports/timeline — combined event timeline (manager)
    router.get('/timeline', authenticate, authorize('manager', 'admin'), (req, res) => {
        try {
            const limit = parseInt(req.query.limit) || 50;
            const events = db.prepare(`
        SELECT 'pos' as source, tl.action as event_type, tl.transaction_id, tl.details, tl.timestamp, u.full_name as actor
        FROM transaction_log tl JOIN users u ON tl.performed_by = u.id
        UNION ALL
        SELECT 'camera' as source, ce.event_type, ce.linked_transaction_id, ce.description as details, ce.timestamp, u.full_name as actor
        FROM camera_events ce LEFT JOIN users u ON ce.cashier_id = u.id
        ORDER BY timestamp DESC LIMIT ?
      `).all(limit);

            res.json(events);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ─── GET /api/reports/export — full data export (admin)
    router.get('/export', authenticate, authorize('admin'), (req, res) => {
        try {
            const data = {
                transactions: db.prepare('SELECT * FROM transactions ORDER BY created_at DESC').all(),
                audit_log: db.prepare('SELECT * FROM transaction_log ORDER BY id DESC').all(),
                camera_events: db.prepare('SELECT * FROM camera_events ORDER BY timestamp DESC').all(),
                alerts: db.prepare('SELECT * FROM alerts ORDER BY created_at DESC').all(),
                drawer_entries: db.prepare('SELECT * FROM drawer_entries ORDER BY timestamp DESC').all(),
                drawer_balances: db.prepare('SELECT * FROM drawer_balance').all(),
                exported_at: new Date().toISOString()
            };
            res.json(data);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};
