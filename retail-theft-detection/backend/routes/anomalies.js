/**
 * Anomaly Detection Routes
 * API endpoints for the 8-type Software Theft detection engine
 */
const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const AnomalyEngine = require('../services/anomalyEngine');

module.exports = function (db) {
    const router = express.Router();
    const engine = new AnomalyEngine(db);

    // ─── GET /api/anomalies/scan — Full anomaly scan ────────
    router.get('/scan', authenticate, authorize('manager', 'admin'), (req, res) => {
        try {
            const hours = parseInt(req.query.hours) || 24;
            const results = engine.fullScan(hours);
            res.json(results);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ─── GET /api/anomalies/stats — Summary stats ───────────
    router.get('/stats', authenticate, authorize('manager', 'admin'), (req, res) => {
        try {
            const hours = parseInt(req.query.hours) || 24;
            const results = engine.fullScan(hours);
            res.json({
                total: results.total_anomalies,
                prosecution_score: results.prosecution_score,
                by_category: Object.fromEntries(
                    Object.entries(results.summary).map(([k, v]) => [k, { count: v.count, severity: v.severity }])
                ),
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ─── GET /api/anomalies/integrity — Log integrity ───────
    router.get('/integrity', authenticate, authorize('manager', 'admin'), (req, res) => {
        try {
            const report = engine.integrityReport();
            res.json(report);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};
