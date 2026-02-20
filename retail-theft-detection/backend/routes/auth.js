/**
 * Authentication Routes
 * Login, register, and user management
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { authenticate, authorize, generateToken } = require('../middleware/auth');

module.exports = function (db) {
    const router = express.Router();

    // POST /api/auth/register
    router.post('/register', async (req, res) => {
        try {
            const { username, password, role, full_name } = req.body;
            if (!username || !password || !role || !full_name) {
                return res.status(400).json({ error: 'All fields required: username, password, role, full_name' });
            }
            if (!['cashier', 'manager', 'admin'].includes(role)) {
                return res.status(400).json({ error: 'Role must be cashier, manager, or admin' });
            }

            const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
            if (existing) {
                return res.status(409).json({ error: 'Username already exists' });
            }

            const id = uuidv4();
            const password_hash = await bcrypt.hash(password, 10);

            db.prepare(`
        INSERT INTO users (id, username, password_hash, role, full_name)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, username, password_hash, role, full_name);

            const token = generateToken({ id, username, role, full_name });
            res.status(201).json({ id, username, role, full_name, token });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // POST /api/auth/login
    router.post('/login', async (req, res) => {
        try {
            const { username, password } = req.body;
            if (!username || !password) {
                return res.status(400).json({ error: 'Username and password required' });
            }

            const user = db.prepare('SELECT * FROM users WHERE username = ? AND active = 1').get(username);
            if (!user) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            const valid = await bcrypt.compare(password, user.password_hash);
            if (!valid) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            const token = generateToken(user);
            res.json({
                id: user.id,
                username: user.username,
                role: user.role,
                full_name: user.full_name,
                token
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // GET /api/auth/me — current user info
    router.get('/me', authenticate, (req, res) => {
        const user = db.prepare('SELECT id, username, role, full_name, created_at FROM users WHERE id = ?').get(req.user.id);
        res.json(user);
    });

    // GET /api/auth/users — admin only
    router.get('/users', authenticate, authorize('admin', 'manager'), (req, res) => {
        const users = db.prepare('SELECT id, username, role, full_name, created_at, active FROM users').all();
        res.json(users);
    });

    return router;
};
