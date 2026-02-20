/**
 * Database Seeder — Enhanced
 * Creates 20 default products, users, sample transactions with drawer tracking
 */
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const HashChain = require('./services/hashChain');

const DB_PATH = path.join(__dirname, 'db', 'retail_theft.db');
const SCHEMA_PATH = path.join(__dirname, 'db', 'schema.sql');

// Delete existing DB
if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Run schema
const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
db.exec(schema);

console.log('🌱 Seeding database...');

// ─── USERS ──────────────────────────────────────────────
const users = [
    { username: 'admin', password: 'admin123', role: 'admin', full_name: 'Admin User', counter: 'admin' },
    { username: 'manager1', password: 'manager123', role: 'manager', full_name: 'Ravi Kumar (Manager)', counter: 'manager' },
    { username: 'cashier1', password: 'cashier123', role: 'cashier', full_name: 'Priya Sharma', counter: 'counter-cashier1' },
    { username: 'cashier2', password: 'cashier123', role: 'cashier', full_name: 'Amit Patel', counter: 'counter-cashier2' },
    { username: 'cashier3', password: 'cashier123', role: 'cashier', full_name: 'Deepa Nair', counter: 'counter-cashier3' },
];

const userMap = {};
for (const u of users) {
    const id = uuidv4();
    const hash = bcrypt.hashSync(u.password, 10);
    db.prepare('INSERT INTO users (id, username, password_hash, role, full_name, counter_id) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, u.username, hash, u.role, u.full_name, u.counter);
    userMap[u.username] = id;
    console.log(`  👤 ${u.role}: ${u.username} / ${u.password}`);
}

// ─── 20 DEFAULT PRODUCTS ────────────────────────────────
const products = [
    // Groceries
    { name: 'Rice (1kg)', sku: 'RICE-001', price: 2.50, category: 'Groceries' },
    { name: 'Wheat Flour (1kg)', sku: 'FLOUR-001', price: 1.80, category: 'Groceries' },
    { name: 'Sugar (1kg)', sku: 'SUGAR-001', price: 1.20, category: 'Groceries' },
    { name: 'Cooking Oil (1L)', sku: 'OIL-001', price: 3.50, category: 'Groceries' },
    { name: 'Salt (500g)', sku: 'SALT-001', price: 0.60, category: 'Groceries' },
    // Beverages
    { name: 'Milk (1L)', sku: 'MILK-001', price: 1.50, category: 'Beverages' },
    { name: 'Water Bottle (1L)', sku: 'WATER-001', price: 0.80, category: 'Beverages' },
    { name: 'Soft Drink (Can)', sku: 'SODA-001', price: 1.20, category: 'Beverages' },
    { name: 'Orange Juice (500ml)', sku: 'JUICE-001', price: 2.00, category: 'Beverages' },
    { name: 'Tea Bags (25pk)', sku: 'TEA-001', price: 3.00, category: 'Beverages' },
    // Snacks
    { name: 'Bread Loaf', sku: 'BREAD-001', price: 1.50, category: 'Snacks' },
    { name: 'Chips (Large)', sku: 'CHIPS-001', price: 2.50, category: 'Snacks' },
    { name: 'Biscuits Pack', sku: 'BISC-001', price: 1.80, category: 'Snacks' },
    { name: 'Chocolate Bar', sku: 'CHOC-001', price: 1.00, category: 'Snacks' },
    { name: 'Instant Noodles', sku: 'NOODLE-001', price: 0.50, category: 'Snacks' },
    // Household
    { name: 'Soap Bar', sku: 'SOAP-001', price: 0.80, category: 'Household' },
    { name: 'Shampoo (250ml)', sku: 'SHAMP-001', price: 3.50, category: 'Household' },
    { name: 'Toothpaste', sku: 'TOOTH-001', price: 2.00, category: 'Household' },
    { name: 'Detergent (500g)', sku: 'DETG-001', price: 2.50, category: 'Household' },
    { name: 'Tissue Paper (Roll)', sku: 'TISSUE-001', price: 1.20, category: 'Household' },
];

const productMap = {};
for (const p of products) {
    const id = uuidv4();
    db.prepare('INSERT INTO products (id, name, sku, price, category) VALUES (?, ?, ?, ?, ?)')
        .run(id, p.name, p.sku, p.price, p.category);
    productMap[p.sku] = { id, ...p };
}
console.log(`  📦 ${products.length} default products seeded`);

// ─── Initialize drawer balances for each cashier ────────
for (const u of users) {
    if (u.role === 'cashier') {
        const counterId = `counter-${u.username}`;
        db.prepare('INSERT INTO drawer_balance (counter_id, cashier_id, current_balance) VALUES (?, ?, 0)')
            .run(counterId, userMap[u.username]);
    }
}
console.log('  💰 Drawer balances initialized at $0.00');

db.close();
console.log('\n✅ Database seeded (clean slate)!\n');
console.log('Demo credentials:');
console.log('  Admin:   admin / admin123');
console.log('  Manager: manager1 / manager123');
console.log('  Cashier: cashier1 / cashier123');
console.log('  Cashier: cashier2 / cashier123');
console.log('  Cashier: cashier3 / cashier123');
