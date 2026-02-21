/**
 * Camera Event Routes — Enhanced
 * Includes customer-presence check endpoint
 */
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { authenticate, authorize } = require('../middleware/auth');

module.exports = function (db) {
    const router = express.Router();

    // ─── POST /api/camera/events — ingest CV event ───────
    router.post('/events', (req, res) => {
        try {
            const { event_type, cashier_id, counter_id, confidence, risk_score, description, frame_path, region_data, linked_transaction_id } = req.body;

            const id = uuidv4();
            db.prepare(`
        INSERT INTO camera_events (id, event_type, cashier_id, counter_id, confidence, risk_score, description, frame_path, region_data, linked_transaction_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, event_type, cashier_id || null, counter_id || 'counter-1',
                confidence || 0.5, risk_score || 0, description || null,
                frame_path || null, region_data ? JSON.stringify(region_data) : null,
                linked_transaction_id || null);

            // Auto-create alerts for suspicious events
            const suspiciousTypes = ['hand_to_pocket', 'drawer_forced_open', 'drawer_opened_no_pos', 'suspicious_gesture', 'currency_anomaly'];
            if (suspiciousTypes.includes(event_type)) {
                const severity = risk_score >= 40 ? 'critical' : risk_score >= 25 ? 'high' : 'medium';
                const alertId = uuidv4();
                db.prepare(`
          INSERT INTO alerts (id, source, severity, title, description, cashier_id, counter_id, camera_event_id, risk_score)
          VALUES (?, 'camera', ?, ?, ?, ?, ?, ?, ?)
        `).run(alertId, severity,
                    `🚨 ${event_type.replace(/_/g, ' ').toUpperCase()}`,
                    description || `Detected: ${event_type} at ${counter_id || 'counter-1'}`,
                    cashier_id || null, counter_id || 'counter-1', id, risk_score || 0);
            }

            res.status(201).json({ id, event_type, alert_created: suspiciousTypes.includes(event_type) });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ─── GET /api/camera/events — list events ─────────────
    router.get('/events', authenticate, authorize('manager', 'admin'), (req, res) => {
        try {
            const { event_type, counter_id, limit } = req.query;
            let sql = `SELECT ce.*, u.full_name as cashier_name FROM camera_events ce
                 LEFT JOIN users u ON ce.cashier_id = u.id WHERE 1=1`;
            const params = [];

            if (event_type) { sql += ' AND ce.event_type = ?'; params.push(event_type); }
            if (counter_id) { sql += ' AND ce.counter_id = ?'; params.push(counter_id); }

            sql += ' ORDER BY ce.timestamp DESC LIMIT ?';
            params.push(parseInt(limit) || 50);

            const events = db.prepare(sql).all(...params);
            res.json(events);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ─── GET /api/camera/customer-check — check if customer is present
    // Simulates camera detection of a person at the counter
    router.get('/customer-check', authenticate, (req, res) => {
        try {
            const counter_id = req.query.counter_id || `counter-${req.user.username}`;

            // In production: call CV service /api/cv/customer-check
            // For demo: check recent camera events in last 30 seconds
            const recentPresence = db.prepare(`
        SELECT * FROM camera_events
        WHERE counter_id = ? AND event_type = 'customer_present'
        AND timestamp >= datetime('now', '-30 seconds')
        ORDER BY timestamp DESC LIMIT 1
      `).get(counter_id);

            if (recentPresence) {
                return res.json({
                    customer_present: true,
                    confidence: recentPresence.confidence,
                    timestamp: recentPresence.timestamp,
                    message: 'Customer detected at counter. Drawer can be opened.'
                });
            }

            // For demo/hackathon: always return true with a simulation note
            // In production, this would query the CV service in real-time
            res.json({
                customer_present: true,
                confidence: 0.92,
                simulated: true,
                message: 'Customer presence verified (simulated for demo). Drawer authorized.'
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ─── POST /api/camera/clips — upload anomaly video ───
    const multer = require('multer');
    const path = require('path');
    const fs = require('fs');
    const storage = multer.diskStorage({
        destination: (req, file, cb) => {
            const dir = path.join(__dirname, '..', 'clips');
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            cb(null, dir);
        },
        filename: (req, file, cb) => {
            cb(null, file.originalname);
        }
    });
    const upload = multer({ storage });

    router.post('/clips', upload.single('clip'), (req, res) => {
        try {
            const { event_id, filename } = req.body;
            const clipPath = `/clips/${filename}`;

            // If event_id provided, update the camera_event
            if (event_id) {
                db.prepare('UPDATE camera_events SET frame_path = ? WHERE id = ?').run(clipPath, event_id);
            } else {
                // If it's a very recent event, try to find the last anomaly
                const lastEvent = db.prepare('SELECT id FROM camera_events WHERE event_type = "currency_anomaly" ORDER BY timestamp DESC LIMIT 1').get();
                if (lastEvent) {
                    db.prepare('UPDATE camera_events SET frame_path = ? WHERE id = ?').run(clipPath, lastEvent.id);
                }
            }

            res.json({ status: 'ok', clip_path: clipPath });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};
