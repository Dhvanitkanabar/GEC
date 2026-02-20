import React, { useState, useEffect, useCallback } from 'react';
import api from './services/api';
import CashierBillingTab from './components/CashierBillingTab';
import ManagerMonitoringTab from './components/ManagerMonitoringTab';
import SoftwareTheftTab from './components/SoftwareTheftTab';
import PhysicalTheftTab from './components/PhysicalTheftTab';
import AlertBanner from './components/AlertBanner';
import LoginPage from './components/LoginPage';

/**
 * App — Role-based dashboard
 * Cashier  → Billing tab only (no camera/audit access)
 * Manager  → Monitoring + All Entries + Drawer Balance + Audit
 * Admin    → Same as Manager + exports
 */

const CASHIER_TABS = [
    { id: 'billing', label: '🧾 Billing', description: 'Point of Sale' },
];

const MANAGER_TABS = [
    { id: 'monitoring', label: '📹 Monitoring', description: 'Camera & Alerts' },
    { id: 'physical', label: '🛡️ Physical Theft', description: 'AI Camera Detection' },
    { id: 'software', label: '💻 Software Theft', description: 'POS Tampering Analysis' },
];

export default function App() {
    const [user, setUser] = useState(api.getUser());
    const [activeTab, setActiveTab] = useState(null);
    const [alerts, setAlerts] = useState([]);
    const [stats, setStats] = useState(null);
    const [showAlert, setShowAlert] = useState(null);

    // Set default tab based on role
    useEffect(() => {
        if (user) {
            setActiveTab(user.role === 'cashier' ? 'billing' : 'monitoring');
        }
    }, [user]);

    const tabs = user?.role === 'admin'
        ? [...CASHIER_TABS, ...MANAGER_TABS]
        : user?.role === 'cashier'
            ? CASHIER_TABS
            : MANAGER_TABS;

    // Load data — alerts and stats
    const loadData = useCallback(async () => {
        if (!user) return;
        try {
            const [statsData] = await Promise.all([
                api.getDashboardStats(),
            ]);
            setStats(statsData);

            // Only managers/admins see alerts
            if (user.role !== 'cashier') {
                const alertData = await api.getUnacknowledgedAlerts();
                setAlerts(alertData);
                const critical = alertData.find(a => a.severity === 'critical' || a.severity === 'high');
                if (critical && critical.id !== showAlert?.id) {
                    setShowAlert(critical);
                }
            }
        } catch (err) {
            console.error('Failed to load data:', err);
        }
    }, [user]);

    useEffect(() => {
        loadData();
        const interval = setInterval(loadData, 10000);
        return () => clearInterval(interval);
    }, [loadData]);

    const handleLogin = (userData) => setUser(userData);
    const handleLogout = () => { api.logout(); setUser(null); };

    if (!user) return <LoginPage onLogin={handleLogin} />;

    return (
        <div className="min-h-screen bg-slate-950">
            {/* Alert Banner (Manager/Admin only) */}
            {showAlert && user.role !== 'cashier' && (
                <AlertBanner
                    alert={showAlert}
                    onDismiss={() => setShowAlert(null)}
                    onAcknowledge={async () => {
                        await api.acknowledgeAlert(showAlert.id);
                        setShowAlert(null);
                        loadData();
                    }}
                />
            )}

            {/* Header */}
            <header className="glass sticky top-0 z-40 border-b border-slate-700/50">
                <div className="max-w-[1600px] mx-auto px-6 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center text-lg font-bold shadow-lg shadow-blue-500/20">
                            RG
                        </div>
                        <div>
                            <h1 className="text-lg font-bold bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
                                RetailGuard
                            </h1>
                            <p className="text-[10px] text-slate-500 uppercase tracking-widest">
                                {user.role === 'cashier' ? 'Point of Sale' : 'Theft Detection Platform'}
                            </p>
                        </div>
                    </div>

                    {/* Tab Navigation (Manager/Admin) */}
                    {user.role !== 'cashier' && (
                        <div className="hidden lg:flex items-center gap-1 bg-slate-900/50 p-1 rounded-xl border border-slate-800">
                            {tabs.map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${activeTab === tab.id
                                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                                        }`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Stats Bar */}
                    {stats && (
                        <div className="hidden md:flex items-center gap-4">
                            {user.role === 'cashier' ? (
                                <>
                                    <StatPill label="My Bills" value={stats.today_transactions} icon="🧾" />
                                    <StatPill label="Revenue" value={`₹${(stats.today_revenue || 0).toFixed(0)}`} icon="💵" color="green" />
                                    {stats.pending_transactions > 0 && (
                                        <StatPill label="Open" value={stats.pending_transactions} icon="⏳" color="yellow" />
                                    )}
                                </>
                            ) : (
                                <>
                                    <StatPill label="Transactions" value={stats.today_transactions} icon="🧾" />
                                    <StatPill label="Revenue" value={`₹${(stats.today_revenue || 0).toFixed(0)}`} icon="💵" color="green" />
                                    <StatPill label="Alerts" value={stats.unacknowledged_alerts} icon="🚨"
                                        color={stats.unacknowledged_alerts > 5 ? 'red' : stats.unacknowledged_alerts > 0 ? 'yellow' : 'green'} />
                                    <StatPill label="High Risk" value={stats.high_risk_transactions} icon="⚠️"
                                        color={stats.high_risk_transactions > 0 ? 'red' : 'green'} />
                                    <StatPill label="Camera" value={stats.suspicious_camera_events} icon="📹"
                                        color={stats.suspicious_camera_events > 0 ? 'yellow' : 'green'} />
                                    <StatPill label="Drawer" value={`₹${(stats.total_drawer_balance || 0).toFixed(0)}`} icon="💰" color="green" />
                                </>
                            )}
                        </div>
                    )}

                    {/* User Menu */}
                    <div className="flex items-center gap-3">
                        <div className="text-right">
                            <p className="text-sm font-medium text-slate-200">{user.full_name}</p>
                            <p className="text-[10px] uppercase tracking-wider text-slate-500">
                                {user.role} {user.role === 'cashier' ? `• counter-${user.username}` : ''}
                            </p>
                        </div>
                        <button onClick={handleLogout}
                            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-400 hover:text-white transition-colors">
                            Logout
                        </button>
                    </div>
                </div>
            </header>

            {/* Tab Content */}
            <main className="max-w-[1600px] mx-auto px-6 py-6">
                {activeTab === 'billing' ? (
                    <CashierBillingTab user={user} />
                ) : (
                    <>
                        {activeTab === 'monitoring' && <ManagerMonitoringTab user={user} />}
                        {activeTab === 'physical' && <PhysicalTheftTab user={user} />}
                        {activeTab === 'software' && <SoftwareTheftTab user={user} />}
                    </>
                )}
            </main>
        </div>
    );
}

function StatPill({ label, value, icon, color = 'blue' }) {
    const colors = {
        blue: 'text-blue-400',
        green: 'text-emerald-400',
        yellow: 'text-amber-400',
        red: 'text-red-400',
    };

    return (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/60 border border-slate-800/50">
            <span className="text-sm">{icon}</span>
            <div>
                <p className={`text-sm font-bold ${colors[color]}`}>{value}</p>
                <p className="text-[9px] text-slate-500 uppercase tracking-wider">{label}</p>
            </div>
        </div>
    );
}
