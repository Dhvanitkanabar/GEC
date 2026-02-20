/**
 * Alert Routes
 * Manage system alerts from POS + camera sources
 */
const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');

module.exports = function (db) {
    const router = express.Router();

    // GET /api/alerts — list alerts with filters
    router.get('/', authenticate, (req, res) => {
        try {
            const { source, severity, acknowledged, cashier_id, limit } = req.query;
            let sql = 'SELECT a.*, u.full_name as cashier_name FROM alerts a LEFT JOIN users u ON a.cashier_id = u.id WHERE 1=1';
            const params = [];

            if (source) { sql += ' AND a.source = ?'; params.push(source); }
            if (severity) { sql += ' AND a.severity = ?'; params.push(severity); }
            if (acknowledged !== undefined) { sql += ' AND a.acknowledged = ?'; params.push(parseInt(acknowledged)); }
            if (cashier_id) { sql += ' AND a.cashier_id = ?'; params.push(cashier_id); }

            sql += ' ORDER BY a.created_at DESC LIMIT ?';
            params.push(parseInt(limit) || 100);

            const alerts = db.prepare(sql).all(...params);
            res.json(alerts);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // GET /api/alerts/unacknowledged — latest unacknowledged
    router.get('/unacknowledged', authenticate, (req, res) => {
        const alerts = db.prepare(`
      SELECT a.*, u.full_name as cashier_name 
      FROM alerts a LEFT JOIN users u ON a.cashier_id = u.id
      WHERE a.acknowledged = 0 ORDER BY a.created_at DESC LIMIT 50
    `).all();
        res.json(alerts);
    });

    // POST /api/alerts/:id/acknowledge
    router.post('/:id/acknowledge', authenticate, authorize('manager', 'admin'), (req, res) => {
        db.prepare(`
      UPDATE alerts SET acknowledged = 1, acknowledged_by = ?, acknowledged_at = datetime('now')
      WHERE id = ?
    `).run(req.user.id, req.params.id);
        res.json({ acknowledged: true });
    });

    // GET /api/alerts/stats — summary statistics
    router.get('/stats', authenticate, (req, res) => {
        try {
            const total = db.prepare('SELECT COUNT(*) as count FROM alerts').get();
            const unack = db.prepare('SELECT COUNT(*) as count FROM alerts WHERE acknowledged = 0').get();
            const bySeverity = db.prepare(`
        SELECT severity, COUNT(*) as count FROM alerts GROUP BY severity
      `).all();
            const bySource = db.prepare(`
        SELECT source, COUNT(*) as count FROM alerts GROUP BY source
      `).all();
            const recent = db.prepare(`
        SELECT * FROM alerts ORDER BY created_at DESC LIMIT 5
      `).all();

            res.json({
                total: total.count,
                unacknowledged: unack.count,
                by_severity: bySeverity,
                by_source: bySource,
                recent
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};
