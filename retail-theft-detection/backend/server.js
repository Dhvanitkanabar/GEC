/**
 * Retail Theft Detection Platform — Backend Server
 * Express.js + SQLite with tamper-proof audit logging
 */
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { spawn } = require('child_process');

// ─── Auto-launch CV Service ───────────────────────────────
const CV_DIR = path.join(__dirname, '..', 'cv-service');
let cvProcess = null;

function startCvService() {
    if (cvProcess) return;

    // On Windows use the 'py' launcher to target Python 3.11 which has all deps
    const isWin = process.platform === 'win32';
    const cmd = isWin ? 'py' : 'python3';
    const args = isWin ? ['-3.11', 'app.py'] : ['app.py'];

    console.log(`📹 Starting CV service (${cmd} ${args.join(' ')})...`);
    cvProcess = spawn(cmd, args, {
        cwd: CV_DIR,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
            ...process.env,
            PYTHONIOENCODING: 'utf-8',
            PYTHONUNBUFFERED: '1'
        }
    });

    cvProcess.stdout.on('data', d => process.stdout.write(`[CV] ${d}`));
    cvProcess.stderr.on('data', d => process.stderr.write(`[CV] ${d}`));

    cvProcess.on('close', (code) => {
        console.log(`[CV] Process exited (code ${code}). Restarting in 3s...`);
        cvProcess = null;
        // Auto-restart unless server is shutting down
        setTimeout(startCvService, 3000);
    });

    cvProcess.on('error', (err) => {
        console.error('[CV] Failed to start:', err.message);
        console.error('[CV] Make sure Python is installed and cv-service/requirements.txt is installed.');
        cvProcess = null;
    });
}

// Clean up CV process on exit
process.on('exit', () => { if (cvProcess) cvProcess.kill(); });
process.on('SIGINT', () => { if (cvProcess) cvProcess.kill(); process.exit(); });
process.on('SIGTERM', () => { if (cvProcess) cvProcess.kill(); process.exit(); });


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
    // Auto-start the CV service (camera always on)
    startCvService();
});

module.exports = app;
