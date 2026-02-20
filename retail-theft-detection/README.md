# 🛡️ RetailGuard — Real-Time Retail Theft Detection Platform

A modular, full-stack system integrating **POS tamper detection**, **physical cash theft monitoring via computer vision**, and a **modern dual-tab dashboard**.

![Tech Stack](https://img.shields.io/badge/Node.js-Express-339933?style=flat&logo=node.js)
![React](https://img.shields.io/badge/React-Tailwind_CSS-61DAFB?style=flat&logo=react)
![Python](https://img.shields.io/badge/Python-Flask+OpenCV-3776AB?style=flat&logo=python)
![SQLite](https://img.shields.io/badge/SQLite-Tamper_Proof-003B57?style=flat&logo=sqlite)

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────┐
│                  React + Tailwind Frontend               │
│           (Dual Tab Dashboard: Software + Physical)      │
├──────────────┬───────────────────────────┬───────────────┤
│              │                           │               │
│   REST API   │      MJPEG Stream         │   WebSocket   │
│              │                           │   (Alerts)    │
├──────────────┴───────────────────────────┴───────────────┤
│                                                          │
│  ┌─────────────────────┐   ┌──────────────────────────┐  │
│  │ Node.js/Express     │   │ Python Flask CV Service   │  │
│  │ Backend (Port 5000) │◄──│ (Port 5001)              │  │
│  │                     │   │                          │  │
│  │ • POS Billing       │   │ • MediaPipe Hand Track   │  │
│  │ • RBAC / JWT Auth   │   │ • Gesture Classification │  │
│  │ • Hash Chain Audit  │   │ • Drawer Monitoring      │  │
│  │ • Risk Engine       │   │ • Face Blurring          │  │
│  │ • Alerts            │   │ • MJPEG Streaming        │  │
│  └────────┬────────────┘   └──────────────────────────┘  │
│           │                                              │
│  ┌────────┴────────────────────────────────────────────┐ │
│  │        SQLite (Tamper-Proof, Encrypted)             │ │
│  │  Append-only audit logs • SHA-256 hash chain       │ │
│  └─────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### Prerequisites
- **Node.js** v18+ and npm
- **Python** 3.9+ and pip

### 1. Backend Setup

```bash
cd backend
npm install
node seed.js    # Seed database with sample data
npm start       # Starts on http://localhost:5000
```

### 2. CV Service Setup

```bash
cd cv-service
pip install -r requirements.txt
python app.py   # Starts on http://localhost:5001
```

### 3. Frontend Setup

```bash
cd frontend
npm install
npm run dev     # Starts on http://localhost:3000
```

### 4. Open the Dashboard

Navigate to **http://localhost:3000** in your browser.

**Demo Credentials:**
| Role | Username | Password |
|------|----------|----------|
| Admin | `admin` | `admin123` |
| Manager | `manager1` | `manager123` |
| Cashier | `cashier1` | `cashier123` |

---

## 📋 Features

### Software Theft Detection (POS Module)
- ✅ Full POS billing system (create, edit, complete, void, refund)
- ✅ **Append-only transaction logs** — no deletion possible
- ✅ **SHA-256 hash chain** — tamper-proof integrity verification
- ✅ **Versioned edits** — all price changes tracked with before/after
- ✅ **RBAC** — Cashier / Manager / Admin with role-specific permissions
- ✅ **Risk scoring** — automatic scoring for anomalies (price edits, voids, refunds)
- ✅ Color-coded severity (Green → Yellow → Orange → Red)

### Physical Theft Detection (Camera Module)
- ✅ **Live MJPEG camera feed** from laptop/external camera
- ✅ **MediaPipe hand tracking** — real-time hand landmark detection
- ✅ **Gesture detection** — hand-to-pocket, hand hovering in drawer, grabbing motion
- ✅ **Drawer monitoring** — opens without POS command, forceful opening
- ✅ **Face blurring** — automatic privacy protection via OpenCV Haar cascades
- ✅ **Camera simulator** — for testing without physical hardware
- ✅ **Audible alerts** — Web Audio API beeps for critical events

### Dashboard
- ✅ **Dual tabs** — Software Theft + Physical Theft views
- ✅ **Real-time alerts** — color-coded with acknowledge/dismiss
- ✅ **Transaction detail modal** — with full audit trail per transaction
- ✅ **Risk score charts** — per-cashier bar charts (Recharts)
- ✅ **Event timeline** — combined POS + camera event history
- ✅ **Filter panels** — by status, risk level, event type, date
- ✅ **Glassmorphism UI** — modern dark theme with blur effects

---

## 🗄️ Database Schema

| Table | Purpose |
|-------|---------|
| `users` | Staff accounts with RBAC roles |
| `products` | Product catalog |
| `transactions` | Bills with status, totals, and risk scores |
| `transaction_items` | Line items per transaction |
| `transaction_log` | **Append-only** audit trail with SHA-256 hash chain |
| `camera_events` | Physical theft events with confidence and coordinates |
| `alerts` | Combined alerts from POS + camera sources |
| `risk_scores` | Historical risk score trends |
| `staff_profiles` | Behavioral profiling per cashier |

---

## 🔌 API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register user |
| POST | `/api/auth/login` | Login → JWT token |
| GET | `/api/auth/me` | Current user info |

### POS Operations
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/pos/products` | List products |
| POST | `/api/pos/transactions` | Create new bill |
| POST | `/api/pos/transactions/:id/items` | Add item to bill |
| PUT | `/api/pos/transactions/:id/items/:itemId/price` | Edit price (flagged) |
| POST | `/api/pos/transactions/:id/complete` | Complete transaction |
| POST | `/api/pos/transactions/:id/void` | Void (manager+) |
| POST | `/api/pos/transactions/:id/refund` | Refund (manager+) |
| GET | `/api/pos/audit-log` | View audit trail |
| GET | `/api/pos/verify-chain` | Verify hash chain (admin) |

### Camera Events
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/camera/events` | Ingest CV event |
| GET | `/api/camera/events` | List events |

### Alerts & Reports
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/alerts` | List alerts |
| GET | `/api/alerts/unacknowledged` | Unacknowledged alerts |
| POST | `/api/alerts/:id/acknowledge` | Acknowledge alert |
| GET | `/api/reports/risk-scores` | Per-cashier risk scores |
| GET | `/api/reports/heatmap` | Activity heatmap data |
| GET | `/api/reports/dashboard-stats` | Dashboard statistics |
| GET | `/api/reports/export` | Export all data (admin) |

### CV Service
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/cv/start` | Start camera feed |
| POST | `/api/cv/stop` | Stop camera feed |
| GET | `/api/cv/feed` | MJPEG video stream |
| GET | `/api/cv/status` | Detection status |

---

## 🧪 Testing

### Simulate Camera Events
```bash
cd cv-service
python camera_sim.py 60 10   # 60 seconds, ~10 events/min
```

### Verify Hash Chain Integrity
Login as admin, navigate to Software Theft tab, and click **"🔗 Verify Hash Chain"**.

### API Testing with curl
```bash
# Login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# Create transaction (use token from login)
curl -X POST http://localhost:5000/api/pos/transactions \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

---

## 📁 Project Structure

```
retail-theft-detection/
├── backend/
│   ├── db/
│   │   └── schema.sql          # Tamper-proof database schema
│   ├── middleware/
│   │   └── auth.js             # JWT + RBAC middleware
│   ├── routes/
│   │   ├── auth.js             # Authentication endpoints
│   │   ├── pos.js              # POS billing + audit
│   │   ├── camera.js           # Camera event ingestion
│   │   ├── alerts.js           # Alert management
│   │   └── reports.js          # Analytics + export
│   ├── services/
│   │   ├── hashChain.js        # SHA-256 hash chain
│   │   └── riskEngine.js       # Risk scoring engine
│   ├── server.js               # Express entry point
│   └── seed.js                 # Sample data generator
├── cv-service/
│   ├── app.py                  # Flask CV service + MJPEG
│   ├── detector.py             # Hand tracking + gesture detection
│   └── camera_sim.py           # Camera simulator
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── SoftwareTheftTab.jsx
│   │   │   ├── PhysicalTheftTab.jsx
│   │   │   ├── RiskScoreChart.jsx
│   │   │   ├── AlertBanner.jsx
│   │   │   └── LoginPage.jsx
│   │   ├── services/
│   │   │   └── api.js          # API client
│   │   ├── App.jsx             # Main app + tab nav
│   │   ├── main.jsx            # React entry
│   │   └── index.css           # Tailwind + custom styles
│   └── index.html
└── README.md
```

---

## 🔐 Security Features

- **Tamper-proof logs**: Append-only INSERT with SHA-256 hash chaining
- **RBAC**: Role-based access control (Cashier < Manager < Admin)
- **JWT authentication**: Secure token-based auth with 12h expiry
- **Privacy**: Automatic face blurring on camera feed
- **Edge processing**: CV runs locally; only events sent to backend

---

## License

MIT — Built for hackathon/proof-of-concept use.
