-- ============================================================
-- RetailGuard — Enhanced Tamper-Proof Database Schema
-- Append-only logs, drawer balance tracking, cash handling
-- ============================================================

-- Users table with RBAC roles
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('cashier', 'manager', 'admin')),
  full_name TEXT NOT NULL,
  counter_id TEXT DEFAULT 'counter-1',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  active INTEGER NOT NULL DEFAULT 1
);

-- Products catalog (20 default retail items)
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sku TEXT UNIQUE NOT NULL,
  price REAL NOT NULL,
  category TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Transactions (bills) — enhanced with cash handling
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  cashier_id TEXT NOT NULL,
  counter_id TEXT DEFAULT 'counter-1',
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'completed', 'voided', 'refunded')),
  subtotal REAL NOT NULL DEFAULT 0,
  tax REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  payment_method TEXT DEFAULT 'cash' CHECK(payment_method IN ('cash', 'online')),
  cash_received REAL DEFAULT 0,
  change_given REAL DEFAULT 0,
  customer_verified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  voided_at TEXT,
  voided_by TEXT,
  void_reason TEXT,
  refunded_at TEXT,
  refunded_by TEXT,
  refund_reason TEXT,
  risk_score REAL NOT NULL DEFAULT 0,
  hash TEXT NOT NULL,
  FOREIGN KEY (cashier_id) REFERENCES users(id),
  FOREIGN KEY (voided_by) REFERENCES users(id),
  FOREIGN KEY (refunded_by) REFERENCES users(id)
);

-- Transaction line items
CREATE TABLE IF NOT EXISTS transaction_items (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price REAL NOT NULL,
  total_price REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (transaction_id) REFERENCES transactions(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- ============================================================
-- APPEND-ONLY AUDIT LOG — SHA-256 hash chain
-- ============================================================
CREATE TABLE IF NOT EXISTS transaction_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN (
    'created', 'item_added', 'item_removed',
    'price_edited', 'completed', 'voided',
    'refunded', 'reopened', 'cash_payment',
    'drawer_opened', 'drawer_forced'
  )),
  performed_by TEXT NOT NULL,
  details TEXT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  prev_hash TEXT,
  hash TEXT NOT NULL,
  FOREIGN KEY (transaction_id) REFERENCES transactions(id),
  FOREIGN KEY (performed_by) REFERENCES users(id)
);

-- ============================================================
-- DRAWER BALANCE TRACKING
-- ============================================================
CREATE TABLE IF NOT EXISTS drawer_balance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  counter_id TEXT NOT NULL DEFAULT 'counter-1',
  cashier_id TEXT NOT NULL,
  current_balance REAL NOT NULL DEFAULT 0,
  last_updated TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (cashier_id) REFERENCES users(id)
);

-- Every cash-in / cash-out event
CREATE TABLE IF NOT EXISTS drawer_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  counter_id TEXT NOT NULL DEFAULT 'counter-1',
  cashier_id TEXT NOT NULL,
  transaction_id TEXT,
  entry_type TEXT NOT NULL CHECK(entry_type IN ('cash_in', 'cash_out', 'change_out', 'initial', 'forced_open')),
  amount REAL NOT NULL,
  balance_after REAL NOT NULL,
  description TEXT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (cashier_id) REFERENCES users(id),
  FOREIGN KEY (transaction_id) REFERENCES transactions(id)
);

-- Camera / physical theft events
CREATE TABLE IF NOT EXISTS camera_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL CHECK(event_type IN (
    'hand_to_pocket', 'hand_hovering_drawer',
    'drawer_opened_no_pos', 'drawer_forced_open',
    'suspicious_gesture', 'normal',
    'customer_present', 'no_customer'
  )),
  cashier_id TEXT,
  counter_id TEXT DEFAULT 'counter-1',
  confidence REAL NOT NULL DEFAULT 0,
  risk_score REAL NOT NULL DEFAULT 0,
  description TEXT,
  frame_path TEXT,
  region_data TEXT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  linked_transaction_id TEXT,
  acknowledged INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (cashier_id) REFERENCES users(id),
  FOREIGN KEY (linked_transaction_id) REFERENCES transactions(id)
);

-- Alerts (combined from POS + camera)
CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK(source IN ('pos', 'camera', 'combined', 'drawer')),
  severity TEXT NOT NULL CHECK(severity IN ('low', 'medium', 'high', 'critical')),
  title TEXT NOT NULL,
  description TEXT,
  cashier_id TEXT,
  counter_id TEXT DEFAULT 'counter-1',
  transaction_id TEXT,
  camera_event_id TEXT,
  risk_score REAL NOT NULL DEFAULT 0,
  acknowledged INTEGER NOT NULL DEFAULT 0,
  acknowledged_by TEXT,
  acknowledged_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (cashier_id) REFERENCES users(id),
  FOREIGN KEY (transaction_id) REFERENCES transactions(id),
  FOREIGN KEY (camera_event_id) REFERENCES camera_events(id),
  FOREIGN KEY (acknowledged_by) REFERENCES users(id)
);

-- Risk score history
CREATE TABLE IF NOT EXISTS risk_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cashier_id TEXT NOT NULL,
  software_score REAL NOT NULL DEFAULT 0,
  physical_score REAL NOT NULL DEFAULT 0,
  combined_score REAL NOT NULL DEFAULT 0,
  shift TEXT,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (cashier_id) REFERENCES users(id)
);

-- Staff behavioral profiles
CREATE TABLE IF NOT EXISTS staff_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cashier_id TEXT NOT NULL UNIQUE,
  avg_transaction_time REAL,
  avg_items_per_transaction REAL,
  void_rate REAL DEFAULT 0,
  refund_rate REAL DEFAULT 0,
  price_edit_rate REAL DEFAULT 0,
  drawer_open_frequency REAL DEFAULT 0,
  anomaly_count INTEGER DEFAULT 0,
  risk_level TEXT DEFAULT 'normal' CHECK(risk_level IN ('normal', 'watch', 'high_risk')),
  last_updated TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (cashier_id) REFERENCES users(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tlog_txn ON transaction_log(transaction_id);
CREATE INDEX IF NOT EXISTS idx_tlog_ts ON transaction_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_camera_ts ON camera_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_camera_type ON camera_events(event_type);
CREATE INDEX IF NOT EXISTS idx_alerts_sev ON alerts(severity);
CREATE INDEX IF NOT EXISTS idx_alerts_ts ON alerts(created_at);
CREATE INDEX IF NOT EXISTS idx_risk_cashier ON risk_scores(cashier_id);
CREATE INDEX IF NOT EXISTS idx_drawer_entries_ts ON drawer_entries(timestamp);
CREATE INDEX IF NOT EXISTS idx_drawer_entries_counter ON drawer_entries(counter_id);
