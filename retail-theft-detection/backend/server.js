/**
 * Retail Theft Detection Platform — Backend Server
 * Express.js + SQLite with tamper-proof audit logging
 */
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// ─── Initialize Database ──────────────────────────────────
const DB_PATH = path.join(__dirname, 'db', 'retail_theft.db');
const SCHEMA_PATH = path.join(__dirname, 'db', 'schema.sql');

// Ensure db directory exists
if (!fs.existsSync(path.dirname(DB_PATH))) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Run schema
const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
db.exec(schema);

console.log('✅ Database initialized at', DB_PATH);

// ─── Express App ──────────────────────────────────────────
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logger
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const ms = Date.now() - start;
        if (!req.path.includes('/api/camera/feed')) {
            console.log(`${req.method} ${req.path} ${res.statusCode} ${ms}ms`);
        }
    });
    next();
});

// ─── Routes ───────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth')(db));
app.use('/api/pos', require('./routes/pos')(db));
app.use('/api/camera', require('./routes/camera')(db));
app.use('/api/alerts', require('./routes/alerts')(db));
app.use('/api/reports', require('./routes/reports')(db));
app.use('/api/anomalies', require('./routes/anomalies')(db));

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// ─── Serve clips directory ────────────────────────────────
const CLIPS_DIR = path.join(__dirname, 'clips');
if (!fs.existsSync(CLIPS_DIR)) fs.mkdirSync(CLIPS_DIR, { recursive: true });
app.use('/clips', express.static(CLIPS_DIR));

// ─── Error handler ────────────────────────────────────────
app.use((err, req, res, next) => {
    console.error('Server Error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// ─── Start Server ─────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`🚀 Retail Theft Detection Backend running on http://localhost:${PORT}`);
    console.log(`   API endpoints available at http://localhost:${PORT}/api`);
});

module.exports = app;
