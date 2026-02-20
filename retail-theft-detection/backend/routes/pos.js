/**
 * POS (Point of Sale) Routes — Enhanced
 * Cash handling with drawer balance tracking, customer verification, change calculation
 */
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { authenticate, authorize } = require('../middleware/auth');
const HashChain = require('../services/hashChain');
const { RiskEngine } = require('../services/riskEngine');

module.exports = function (db) {
    const router = express.Router();

    // ─── Helper: append to audit log with hash chain ──────
    function appendLog(transactionId, action, performedBy, details = null) {
        const lastLog = db.prepare('SELECT hash FROM transaction_log ORDER BY id DESC LIMIT 1').get();
        const prevHash = lastLog ? lastLog.hash : null;
        const timestamp = new Date().toISOString();

        const entry = {
            transaction_id: transactionId,
            action,
            performed_by: performedBy,
            details: details ? JSON.stringify(details) : null,
            timestamp,
            prev_hash: prevHash
        };

        const hash = HashChain.generateHash(entry, prevHash);

        db.prepare(`
      INSERT INTO transaction_log (transaction_id, action, performed_by, details, timestamp, prev_hash, hash)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(transactionId, action, performedBy, entry.details, timestamp, prevHash, hash);

        return { hash, timestamp };
    }

    // ─── Helper: get or create drawer balance ─────────────
    function getDrawerBalance(counterId, cashierId) {
        let balance = db.prepare('SELECT * FROM drawer_balance WHERE counter_id = ? ORDER BY id DESC LIMIT 1').get(counterId);
        if (!balance) {
            db.prepare('INSERT INTO drawer_balance (counter_id, cashier_id, current_balance) VALUES (?, ?, 0)').run(counterId, cashierId);
            balance = { current_balance: 0 };
        }
        return balance.current_balance;
    }

    // ─── Helper: update drawer balance and log entry ──────
    function updateDrawerBalance(counterId, cashierId, amount, entryType, transactionId, description) {
        const currentBalance = getDrawerBalance(counterId, cashierId);
        const newBalance = Math.round((Number(currentBalance) + Number(amount)) * 100) / 100;

        db.prepare('UPDATE drawer_balance SET current_balance = ?, cashier_id = ?, last_updated = ? WHERE counter_id = ?')
            .run(newBalance, cashierId, new Date().toISOString(), counterId);

        db.prepare(`
      INSERT INTO drawer_entries (counter_id, cashier_id, transaction_id, entry_type, amount, balance_after, description)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(counterId, cashierId, transactionId || null, entryType, amount, newBalance, description || null);

        return newBalance;
    }

    // ─── GET /api/pos/products — list all 20 default products
    router.get('/products', authenticate, (req, res) => {
        const products = db.prepare('SELECT * FROM products ORDER BY category, name').all();
        res.json(products);
    });

    // ─── POST /api/pos/transactions — create new bill ─────
    router.post('/transactions', authenticate, authorize('cashier', 'manager', 'admin'), (req, res) => {
        try {
            const id = uuidv4();
            const created_at = new Date().toISOString();
            const counterId = `counter-${req.user.username}`;
            const hash = HashChain.hashTransaction({
                id, cashier_id: req.user.id, subtotal: 0, tax: 0, total: 0, status: 'open', created_at
            });

            db.prepare(`
        INSERT INTO transactions (id, cashier_id, counter_id, status, subtotal, tax, total, created_at, hash)
        VALUES (?, ?, ?, 'open', 0, 0, 0, ?, ?)
      `).run(id, req.user.id, counterId, created_at, hash);

            appendLog(id, 'created', req.user.id, { status: 'open', counter: counterId });

            const txn = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
            res.status(201).json(txn);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ─── POST /api/pos/transactions/:id/items — add item ──
    router.post('/transactions/:id/items', authenticate, authorize('cashier', 'manager'), (req, res) => {
        try {
            const txn = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
            if (!txn) return res.status(404).json({ error: 'Transaction not found' });
            if (txn.status !== 'open') return res.status(400).json({ error: 'Transaction is not open' });

            if (req.user.role === 'cashier' && txn.cashier_id !== req.user.id) {
                return res.status(403).json({ error: 'Cannot modify another cashier\'s transaction' });
            }

            const { product_id, quantity } = req.body;
            const product = db.prepare('SELECT * FROM products WHERE id = ?').get(product_id);
            if (!product) return res.status(404).json({ error: 'Product not found' });

            const qty = quantity || 1;
            const itemId = uuidv4();
            const totalPrice = Math.round(product.price * qty * 100) / 100;

            db.prepare(`
        INSERT INTO transaction_items (id, transaction_id, product_id, product_name, quantity, unit_price, total_price)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(itemId, req.params.id, product_id, product.name, qty, product.price, totalPrice);

            // Recalculate totals
            const items = db.prepare('SELECT SUM(total_price) as subtotal FROM transaction_items WHERE transaction_id = ?').get(req.params.id);
            const subtotal = Math.round((items.subtotal || 0) * 100) / 100;
            const tax = Math.round(subtotal * 0.1 * 100) / 100;
            const total = Math.round((subtotal + tax) * 100) / 100;

            db.prepare('UPDATE transactions SET subtotal = ?, tax = ?, total = ? WHERE id = ?')
                .run(subtotal, tax, total, req.params.id);

            appendLog(req.params.id, 'item_added', req.user.id, {
                product_name: product.name, quantity: qty, unit_price: product.price
            });

            const updated = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
            const allItems = db.prepare('SELECT * FROM transaction_items WHERE transaction_id = ?').all(req.params.id);
            res.json({ ...updated, items: allItems });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ─── DELETE /api/pos/transactions/:id/items/:itemId — remove item
    router.delete('/transactions/:id/items/:itemId', authenticate, authorize('cashier', 'manager'), (req, res) => {
        try {
            const txn = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
            if (!txn) return res.status(404).json({ error: 'Transaction not found' });
            if (txn.status !== 'open') return res.status(400).json({ error: 'Transaction is not open' });

            const item = db.prepare('SELECT * FROM transaction_items WHERE id = ? AND transaction_id = ?')
                .get(req.params.itemId, req.params.id);
            if (!item) return res.status(404).json({ error: 'Item not found' });

            db.prepare('DELETE FROM transaction_items WHERE id = ?').run(req.params.itemId);

            // Recalculate
            const items = db.prepare('SELECT SUM(total_price) as subtotal FROM transaction_items WHERE transaction_id = ?').get(req.params.id);
            const subtotal = Math.round((items.subtotal || 0) * 100) / 100;
            const tax = Math.round(subtotal * 0.1 * 100) / 100;
            const total = Math.round((subtotal + tax) * 100) / 100;

            db.prepare('UPDATE transactions SET subtotal = ?, tax = ?, total = ? WHERE id = ?')
                .run(subtotal, tax, total, req.params.id);

            appendLog(req.params.id, 'item_removed', req.user.id, { product_name: item.product_name });

            const updated = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
            const allItems = db.prepare('SELECT * FROM transaction_items WHERE transaction_id = ?').all(req.params.id);
            res.json({ ...updated, items: allItems });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ═══════════════════════════════════════════════════════
    // CASH PAYMENT — The core enhanced flow
    // 1. Checks camera for customer presence
    // 2. Records cash received
    // 3. Calculates change
    // 4. Updates drawer balance
    // 5. Completes transaction
    // ═══════════════════════════════════════════════════════
    router.post('/transactions/:id/cash-payment', authenticate, authorize('cashier', 'manager'), async (req, res) => {
        try {
            const txn = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
            if (!txn) return res.status(404).json({ error: 'Transaction not found' });
            if (txn.status !== 'open') return res.status(400).json({ error: 'Transaction is not open' });
            if (txn.total <= 0) return res.status(400).json({ error: 'No items in transaction' });

            const cash_received = Number(req.body.cash_received);
            const customer_verified = req.body.customer_verified;
            if (isNaN(cash_received)) return res.status(400).json({ error: 'cash_received must be a number' });
            if (cash_received < txn.total) return res.status(400).json({
                error: 'Insufficient cash', required: txn.total, received: cash_received
            });

            // Customer verification check
            if (!customer_verified) {
                return res.status(403).json({
                    error: 'Customer presence not verified',
                    message: 'Camera must confirm a customer is present at the counter before the drawer can be opened for cash transactions.'
                });
            }

            const changeAmount = Math.round((cash_received - txn.total) * 100) / 100;
            const completed_at = new Date().toISOString();
            const counterId = txn.counter_id || `counter-${req.user.username}`;

            // Update transaction
            db.prepare(`
        UPDATE transactions SET status = 'completed', payment_method = 'cash',
        cash_received = ?, change_given = ?, customer_verified = 1,
        completed_at = ? WHERE id = ?
      `).run(cash_received, changeAmount, completed_at, req.params.id);

            // Update drawer balance: cash IN, change OUT
            const balanceAfterCashIn = updateDrawerBalance(
                counterId, req.user.id, cash_received, 'cash_in', req.params.id,
                `Cash received for bill ₹${txn.total}`
            );
            const finalBalance = updateDrawerBalance(
                counterId, req.user.id, -changeAmount, 'change_out', req.params.id,
                `Change given: ₹${changeAmount}`
            );

            appendLog(req.params.id, 'cash_payment', req.user.id, {
                cash_received, change_given: changeAmount, total: txn.total,
                drawer_balance: finalBalance, customer_verified: true
            });
            appendLog(req.params.id, 'completed', req.user.id, { payment_method: 'cash' });
            appendLog(req.params.id, 'drawer_opened', req.user.id, {
                reason: 'cash_payment', counter: counterId
            });

            const updated = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
            res.json({
                ...updated,
                change_amount: changeAmount,
                drawer_balance: finalBalance,
                message: `Give change: ₹${changeAmount.toFixed(2)}`
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ─── POST /api/pos/transactions/:id/online-payment — complete with online
    router.post('/transactions/:id/online-payment', authenticate, authorize('cashier', 'manager'), (req, res) => {
        try {
            const txn = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
            if (!txn) return res.status(404).json({ error: 'Transaction not found' });
            if (txn.status !== 'open') return res.status(400).json({ error: 'Transaction is not open' });
            if (txn.total <= 0) return res.status(400).json({ error: 'No items in transaction' });

            const completed_at = new Date().toISOString();

            db.prepare(`
        UPDATE transactions SET status = 'completed', payment_method = 'online',
        completed_at = ? WHERE id = ?
      `).run(completed_at, req.params.id);

            appendLog(req.params.id, 'completed', req.user.id, { payment_method: 'online' });

            const updated = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
            res.json({ ...updated, message: 'Online payment recorded. Drawer NOT opened.' });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ─── POST /api/pos/drawer/forced — report forced drawer open (alert)
    router.post('/drawer/forced', authenticate, (req, res) => {
        try {
            const { counter_id, cashier_id, description } = req.body;
            const cid = counter_id || `counter-${req.user.username}`;

            // Create critical alert for manager
            const alertId = uuidv4();
            db.prepare(`
        INSERT INTO alerts (id, source, severity, title, description, cashier_id, counter_id, risk_score)
        VALUES (?, 'drawer', 'critical', ?, ?, ?, ?, 90)
      `).run(alertId,
                `⚠️ DRAWER FORCEFULLY OPENED — ${cid}`,
                description || `Drawer at ${cid} was opened without a POS cash-payment command. Possible tampering.`,
                cashier_id || req.user.id, cid);

            // Log camera event
            const eventId = uuidv4();
            db.prepare(`
        INSERT INTO camera_events (id, event_type, cashier_id, counter_id, confidence, risk_score, description)
        VALUES (?, 'drawer_forced_open', ?, ?, 0.95, 50, ?)
      `).run(eventId, cashier_id || req.user.id, cid,
                description || 'Drawer opened without POS command');

            res.status(201).json({ alert_id: alertId, severity: 'critical', message: 'Forced drawer alert sent to manager' });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ─── GET /api/pos/drawer-balance — current drawer balance
    router.get('/drawer-balance', authenticate, (req, res) => {
        try {
            const { counter_id } = req.query;
            if (counter_id) {
                const balance = getDrawerBalance(counter_id, req.user.id);
                return res.json({ counter_id, balance });
            }
            // All counters (manager/admin)
            const balances = db.prepare('SELECT * FROM drawer_balance ORDER BY counter_id').all();
            res.json(balances);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ─── GET /api/pos/drawer-entries — drawer cash movement log
    router.get('/drawer-entries', authenticate, (req, res) => {
        try {
            const { counter_id, limit } = req.query;
            let sql = `SELECT de.*, u.full_name as cashier_name FROM drawer_entries de
                 LEFT JOIN users u ON de.cashier_id = u.id WHERE 1=1`;
            const params = [];

            if (counter_id) { sql += ' AND de.counter_id = ?'; params.push(counter_id); }
            // Cashiers can only see their own entries
            if (req.user.role === 'cashier') { sql += ' AND de.cashier_id = ?'; params.push(req.user.id); }

            sql += ' ORDER BY de.timestamp DESC LIMIT ?';
            params.push(parseInt(limit) || 100);

            const entries = db.prepare(sql).all(...params);
            res.json(entries);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ─── POST /api/pos/transactions/:id/void — void (manager only)
    router.post('/transactions/:id/void', authenticate, authorize('manager', 'admin'), (req, res) => {
        try {
            const txn = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
            if (!txn) return res.status(404).json({ error: 'Transaction not found' });
            if (txn.status === 'voided') return res.status(400).json({ error: 'Already voided' });

            const { reason } = req.body;
            const voided_at = new Date().toISOString();

            db.prepare(`
        UPDATE transactions SET status = 'voided', voided_at = ?, voided_by = ?, void_reason = ?,
        risk_score = MIN(100, risk_score + 20) WHERE id = ?
      `).run(voided_at, req.user.id, reason || 'No reason', req.params.id);

            appendLog(req.params.id, 'voided', req.user.id, { reason: reason || 'No reason' });

            const alertId = uuidv4();
            db.prepare(`
        INSERT INTO alerts (id, source, severity, title, description, cashier_id, transaction_id, risk_score)
        VALUES (?, 'pos', 'medium', 'Transaction Voided', ?, ?, ?, 20)
      `).run(alertId, `Voided by ${req.user.full_name}. Reason: ${reason || 'None'}`,
                txn.cashier_id, req.params.id);

            const updated = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
            res.json(updated);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ─── POST /api/pos/transactions/:id/refund — refund (manager only)
    router.post('/transactions/:id/refund', authenticate, authorize('manager', 'admin'), (req, res) => {
        try {
            const txn = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
            if (!txn) return res.status(404).json({ error: 'Transaction not found' });
            if (txn.status !== 'completed') return res.status(400).json({ error: 'Only completed transactions can be refunded' });

            const { reason } = req.body;
            db.prepare(`
        UPDATE transactions SET status = 'refunded', refunded_at = datetime('now'), refunded_by = ?,
        refund_reason = ?, risk_score = MIN(100, risk_score + 10) WHERE id = ?
      `).run(req.user.id, reason || 'No reason', req.params.id);

            appendLog(req.params.id, 'refunded', req.user.id, { reason: reason || 'No reason', amount: txn.total });

            const updated = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
            res.json(updated);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ─── GET /api/pos/transactions — list with filters ────
    router.get('/transactions', authenticate, (req, res) => {
        try {
            const { status, cashier_id, date_from, date_to, min_risk, limit } = req.query;
            let sql = 'SELECT t.*, u.full_name as cashier_name FROM transactions t JOIN users u ON t.cashier_id = u.id WHERE 1=1';
            const params = [];

            // Cashiers can only see their own transactions
            if (req.user.role === 'cashier') {
                sql += ' AND t.cashier_id = ?'; params.push(req.user.id);
            }
            if (status) { sql += ' AND t.status = ?'; params.push(status); }
            if (cashier_id) { sql += ' AND t.cashier_id = ?'; params.push(cashier_id); }
            if (date_from) { sql += ' AND t.created_at >= ?'; params.push(date_from); }
            if (date_to) { sql += ' AND t.created_at <= ?'; params.push(date_to); }
            if (min_risk) { sql += ' AND t.risk_score >= ?'; params.push(parseFloat(min_risk)); }

            sql += ' ORDER BY t.created_at DESC LIMIT ?';
            params.push(parseInt(limit) || 100);

            const transactions = db.prepare(sql).all(...params);
            res.json(transactions);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ─── GET /api/pos/transactions/:id — detail with items
    router.get('/transactions/:id', authenticate, (req, res) => {
        try {
            const txn = db.prepare(`
        SELECT t.*, u.full_name as cashier_name
        FROM transactions t JOIN users u ON t.cashier_id = u.id WHERE t.id = ?
      `).get(req.params.id);
            if (!txn) return res.status(404).json({ error: 'Transaction not found' });

            const items = db.prepare('SELECT * FROM transaction_items WHERE transaction_id = ?').all(req.params.id);
            const logs = db.prepare(`
        SELECT tl.*, u.full_name as performed_by_name
        FROM transaction_log tl JOIN users u ON tl.performed_by = u.id
        WHERE tl.transaction_id = ? ORDER BY tl.id ASC
      `).all(req.params.id);

            res.json({ ...txn, items, audit_log: logs });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ─── GET /api/pos/audit-log — full audit trail (manager/admin only)
    router.get('/audit-log', authenticate, authorize('manager', 'admin'), (req, res) => {
        try {
            const { transaction_id, action, limit } = req.query;
            let sql = `SELECT tl.*, u.full_name as performed_by_name
                 FROM transaction_log tl JOIN users u ON tl.performed_by = u.id WHERE 1=1`;
            const params = [];

            if (transaction_id) { sql += ' AND tl.transaction_id = ?'; params.push(transaction_id); }
            if (action) { sql += ' AND tl.action = ?'; params.push(action); }

            sql += ' ORDER BY tl.id DESC LIMIT ?';
            params.push(parseInt(limit) || 200);

            const logs = db.prepare(sql).all(...params);
            res.json(logs);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ─── GET /api/pos/verify-chain — verify hash chain (admin only)
    router.get('/verify-chain', authenticate, authorize('admin'), (req, res) => {
        try {
            const logs = db.prepare('SELECT * FROM transaction_log ORDER BY id ASC').all();
            const result = HashChain.verifyChain(logs);
            res.json({ total_entries: logs.length, ...result });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};
