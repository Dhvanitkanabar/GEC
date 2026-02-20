import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../services/api';

/**
 * ManagerMonitoringTab — Full monitoring dashboard for managers/admins
 * 
 * Shows: Live camera feed, all entries, drawer balance per counter,
 * alerts with beep sounds, forced-drawer alerts, event timeline
 */
export default function ManagerMonitoringTab({ user }) {
    const [view, setView] = useState('monitoring'); // monitoring | transactions | drawer | audit
    const [alerts, setAlerts] = useState([]);
    const [events, setEvents] = useState([]);
    const [transactions, setTransactions] = useState([]);
    const [drawerSummary, setDrawerSummary] = useState(null);
    const [auditLog, setAuditLog] = useState([]);
    const [riskScores, setRiskScores] = useState([]);
    const [timeline, setTimeline] = useState([]);
    const [cvStatus, setCvStatus] = useState(null);
    const [feedActive, setFeedActive] = useState(false);
    const [isSimulator, setIsSimulator] = useState(false);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState({ event_type: '', status: 'completed' });
    const lastAlertRef = useRef(null);

    const loadData = useCallback(async () => {
        try {
            const [alertData, eventData, txnData, drawerData, auditData, riskData, timelineData] = await Promise.all([
                api.getAlerts({ limit: 30 }),
                api.getCameraEvents({ ...filter, limit: 30 }).catch(() => []),
                api.getTransactions({ ...filter, limit: 50 }),
                api.getDrawerSummary().catch(() => null),
                api.getAuditLog({ limit: 100 }).catch(() => []),
                api.getRiskScores(24).catch(() => []),
                api.getTimeline(30).catch(() => []),
            ]);
            setAlerts(alertData);
            setEvents(eventData);
            setTransactions(txnData);
            setDrawerSummary(drawerData);
            setAuditLog(auditData);
            setRiskScores(riskData);
            setTimeline(timelineData);

            // Check for new critical alerts → play beep
            const critical = alertData.find(a =>
                (a.severity === 'critical' || a.severity === 'high') && !a.acknowledged
            );
            if (critical && critical.id !== lastAlertRef.current) {
                lastAlertRef.current = critical.id;
                playBeep('alert');
            }

            // CV status
            const status = await api.cvStatus();
            setCvStatus(status);
            setFeedActive(status?.running || false);
            if (status?.running) setIsSimulator(status.simulator || false);
        } catch (err) {
            console.error('Failed to load monitoring data:', err);
        } finally {
            setLoading(false);
        }
    }, [filter]);

    useEffect(() => { loadData(); }, [loadData]);

    // Auto-refresh every 5 seconds
    useEffect(() => {
        const interval = setInterval(loadData, 5000);
        return () => clearInterval(interval);
    }, [loadData]);

    const playBeep = (type) => {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = type === 'alert' ? 'square' : 'sine';
            osc.frequency.value = type === 'alert' ? 880 : 440;
            gain.gain.value = 0.4;
            osc.start();
            // Beep pattern for alerts
            if (type === 'alert') {
                gain.gain.setValueAtTime(0.4, ctx.currentTime);
                gain.gain.setValueAtTime(0, ctx.currentTime + 0.15);
                gain.gain.setValueAtTime(0.4, ctx.currentTime + 0.25);
                gain.gain.setValueAtTime(0, ctx.currentTime + 0.4);
                gain.gain.setValueAtTime(0.4, ctx.currentTime + 0.5);
                osc.stop(ctx.currentTime + 0.7);
            } else {
                osc.stop(ctx.currentTime + 0.2);
            }
        } catch (e) { /* silent */ }
    };

    const toggleFeed = async () => {
        try {
            if (feedActive) {
                await api.cvStop();
                setFeedActive(false);
            } else {
                await api.cvStart(isSimulator);
                setFeedActive(true);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const getSeverityClass = (score) => {
        if (score >= 40) return 'text-red-400';
        if (score >= 25) return 'text-orange-400';
        if (score >= 10) return 'text-amber-400';
        return 'text-emerald-400';
    };

    const getSeverityBadge = (severity) => {
        const styles = {
            critical: 'bg-red-500/20 text-red-400 border-red-500/30',
            high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
            medium: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
            low: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
        };
        return styles[severity] || styles.low;
    };

    const eventIcons = {
        hand_to_pocket: '🤚',
        hand_hovering_drawer: '✋',
        drawer_forced_open: '💥',
        drawer_opened_no_pos: '🗄️',
        suspicious_gesture: '👀',
        customer_present: '👤',
        normal: '✅',
    };

    return (
        <div className="space-y-6">
            {/* Sub-navigation */}
            <div className="flex items-center justify-between">
                <div className="flex gap-2">
                    {[
                        { id: 'monitoring', label: '📹 Live Monitor', icon: '📹' },
                        { id: 'transactions', label: '🧾 All Entries', icon: '🧾' },
                        { id: 'drawer', label: '💰 Drawer Balance', icon: '💰' },
                        { id: 'audit', label: '📋 Audit Trail', icon: '📋' },
                    ].map(v => (
                        <button key={v.id} onClick={() => setView(v.id)}
                            className={`px-4 py-2 rounded-lg text-xs font-medium transition-all ${view === v.id
                                ? 'bg-blue-600/20 border border-blue-500/30 text-blue-400'
                                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
                                }`}>
                            {v.label}
                        </button>
                    ))}
                </div>
                <button onClick={loadData}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-400 hover:text-white transition">
                    ↻ Refresh
                </button>
            </div>

            {/* ═══════ LIVE MONITORING ═══════ */}
            {view === 'monitoring' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Camera Feed */}
                    <div className="lg:col-span-2 glass-card overflow-hidden">
                        <div className="p-4 border-b border-slate-800/50 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${feedActive ? 'bg-red-500 animate-pulse' : 'bg-slate-600'}`} />
                                <h3 className="text-sm font-semibold text-slate-200">
                                    {feedActive ? 'LIVE MONITOR' : 'Camera (Offline)'}
                                </h3>
                            </div>
                            <div className="flex items-center gap-3">
                                {!feedActive && (
                                    <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-slate-900 border border-slate-800">
                                        <span className="text-[10px] text-slate-500 uppercase font-bold tracking-tighter">Mock</span>
                                        <button
                                            onClick={() => setIsSimulator(!isSimulator)}
                                            className={`relative w-8 h-4 rounded-full transition-colors ${isSimulator ? 'bg-blue-600' : 'bg-slate-700'}`}
                                        >
                                            <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${isSimulator ? 'left-[18px]' : 'left-0.5'}`} />
                                        </button>
                                        <span className="text-[10px] text-slate-300 uppercase font-bold tracking-tighter">Live</span>
                                    </div>
                                )}
                                <button onClick={toggleFeed}
                                    className={`px-4 py-1.5 rounded-lg text-xs font-medium transition ${feedActive ? 'bg-red-600/20 border border-red-500/30 text-red-400' : 'bg-emerald-600/20 border border-emerald-500/30 text-emerald-400'
                                        }`}>
                                    {feedActive ? '⏹ Stop' : '▶ Start'}
                                </button>
                            </div>
                        </div>
                        <div className="relative aspect-video bg-slate-950 flex items-center justify-center">
                            {feedActive ? (
                                <img src={api.cvFeedUrl} alt="Camera Feed" className="w-full h-full object-contain" />
                            ) : (
                                <div className="text-center">
                                    <p className="text-6xl mb-4 opacity-30">📹</p>
                                    <p className="text-slate-500 text-sm">Start monitoring to see live feed</p>
                                </div>
                            )}
                            {feedActive && (
                                <div className="absolute top-3 left-3 flex items-center gap-2">
                                    <span className="px-2 py-1 rounded bg-red-600/80 text-white text-xs font-bold flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" /> REC
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Real-time Alert Panel */}
                    <div className="glass-card flex flex-col">
                        <div className="p-4 border-b border-slate-800/50">
                            <h3 className="text-sm font-semibold text-slate-200">🚨 Live Alerts</h3>
                            <p className="text-[10px] text-slate-500">
                                Beep sounds when suspicious activity detected
                            </p>
                        </div>
                        <div className="flex-1 overflow-y-auto p-3 space-y-2 max-h-[450px]">
                            {alerts.filter(a => !a.acknowledged).slice(0, 20).map(alert => (
                                <div key={alert.id}
                                    className={`p-3 rounded-lg border ${getSeverityBadge(alert.severity)} transition-all ${alert.severity === 'critical' ? 'animate-pulse' : ''
                                        }`}>
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-bold truncate">{alert.title}</p>
                                            <p className="text-[11px] text-slate-400 truncate mt-0.5">{alert.description}</p>
                                            <div className="flex items-center gap-2 mt-1">
                                                {alert.counter_id && <span className="text-[10px] text-slate-500">📍 {alert.counter_id}</span>}
                                                <span className="text-[10px] text-slate-600">{new Date(alert.created_at).toLocaleTimeString()}</span>
                                            </div>
                                        </div>
                                        <button
                                            onClick={async () => { await api.acknowledgeAlert(alert.id); loadData(); }}
                                            className="px-2 py-1 rounded text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-400 shrink-0">
                                            ✓
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {alerts.filter(a => !a.acknowledged).length === 0 && (
                                <p className="text-center text-slate-600 text-sm py-8">No pending alerts</p>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════ Event Timeline (below camera on monitoring tab) ═══════ */}
            {view === 'monitoring' && (
                <div className="glass-card overflow-hidden">
                    <div className="p-4 border-b border-slate-800/50 flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-slate-200">📋 Combined Event Timeline</h3>
                        <select value={filter.event_type} onChange={e => setFilter(f => ({ ...f, event_type: e.target.value }))}
                            className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-300">
                            <option value="">All Events</option>
                            <option value="hand_to_pocket">Hand to Pocket</option>
                            <option value="drawer_forced_open">Forced Drawer</option>
                            <option value="suspicious_gesture">Suspicious</option>
                        </select>
                    </div>
                    <div className="divide-y divide-slate-800/30 max-h-[300px] overflow-y-auto">
                        {timeline.map((evt, i) => (
                            <div key={i} className="px-4 py-3 flex items-center gap-3 hover:bg-slate-900/30">
                                <span className={`px-2 py-1 rounded text-[10px] font-bold ${evt.source === 'camera' ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'
                                    }`}>{evt.source.toUpperCase()}</span>
                                <span className="text-lg">{eventIcons[evt.event_type] || '📋'}</span>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm text-slate-200">{evt.event_type.replace(/_/g, ' ')}</p>
                                    <p className="text-[11px] text-slate-500">{evt.actor || 'System'}</p>
                                </div>
                                <span className="text-[10px] text-slate-600">{new Date(evt.timestamp).toLocaleTimeString()}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ═══════ ALL ENTRIES (Transactions) ═══════ */}
            {view === 'transactions' && (
                <div className="glass-card overflow-hidden">
                    <div className="p-4 border-b border-slate-800/50 flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-slate-200">🧾 All Transaction Entries</h3>
                        <select value={filter.status} onChange={e => setFilter(f => ({ ...f, status: e.target.value }))}
                            className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-300">
                            <option value="">All</option>
                            <option value="completed">Completed</option>
                            <option value="open">Open</option>
                            <option value="voided">Voided</option>
                        </select>
                    </div>
                    <table className="data-table">
                        <thead>
                            <tr className="bg-slate-900/50">
                                <th>ID</th>
                                <th>Cashier</th>
                                <th>Counter</th>
                                <th>Status</th>
                                <th>Payment</th>
                                <th>Total</th>
                                <th>Cash Received</th>
                                <th>Change</th>
                                <th>Customer</th>
                                <th>Risk</th>
                                <th>Date</th>
                            </tr>
                        </thead>
                        <tbody>
                            {transactions.map(txn => (
                                <tr key={txn.id} className={txn.risk_score > 30 ? 'bg-red-950/15' : ''}>
                                    <td className="font-mono text-xs text-slate-400">{txn.id.substring(0, 8)}...</td>
                                    <td className="text-slate-200">{txn.cashier_name}</td>
                                    <td className="text-xs text-slate-400">{txn.counter_id}</td>
                                    <td>
                                        <span className={`badge border ${txn.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                                            txn.status === 'voided' ? 'bg-red-500/20 text-red-400 border-red-500/30' :
                                                'bg-blue-500/20 text-blue-400 border-blue-500/30'
                                            }`}>{txn.status}</span>
                                    </td>
                                    <td>
                                        <span className={`badge border ${txn.payment_method === 'cash' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' :
                                            'bg-blue-500/20 text-blue-400 border-blue-500/30'
                                            }`}>{txn.payment_method === 'cash' ? '💵' : '📱'} {txn.payment_method}</span>
                                    </td>
                                    <td className="font-semibold text-slate-200">₹{txn.total.toFixed(2)}</td>
                                    <td className="text-slate-300">{txn.payment_method === 'cash' ? `₹${txn.cash_received.toFixed(2)}` : '—'}</td>
                                    <td className="text-slate-300">{txn.payment_method === 'cash' ? `₹${txn.change_given.toFixed(2)}` : '—'}</td>
                                    <td>{txn.customer_verified ? '✅' : '—'}</td>
                                    <td>
                                        <span className={`text-xs font-mono font-bold ${getSeverityClass(txn.risk_score)}`}>
                                            {txn.risk_score.toFixed(0)}
                                        </span>
                                    </td>
                                    <td className="text-xs text-slate-400">{new Date(txn.created_at).toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* ═══════ DRAWER BALANCE ═══════ */}
            {view === 'drawer' && (
                <div className="space-y-6">
                    {/* Summary Cards */}
                    {drawerSummary ? (
                        <>
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                                <SummaryCard label="Total Cash In" value={`₹${drawerSummary.summary.total_cash_in.toFixed(2)}`} icon="💵" color="emerald" />
                                <SummaryCard label="Total Change Out" value={`₹${drawerSummary.summary.total_change_out.toFixed(2)}`} icon="💸" color="amber" />
                                <SummaryCard label="Net Cash" value={`₹${drawerSummary.summary.net_cash.toFixed(2)}`} icon="💰" color="blue" />
                                <SummaryCard label="Cash Transactions" value={drawerSummary.summary.cash_transactions} icon="🧾" color="slate" />
                                <SummaryCard label="Cash Revenue" value={`₹${drawerSummary.summary.cash_revenue.toFixed(2)}`} icon="📊" color="cyan" />
                            </div>

                            {/* Per-counter balances */}
                            <div className="glass-card p-6">
                                <h3 className="text-sm font-semibold text-slate-200 mb-4">Counter Balances</h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {drawerSummary.balances.map((b, i) => (
                                        <div key={i} className="p-4 rounded-xl bg-slate-900/50 border border-slate-800">
                                            <p className="text-xs text-slate-500 uppercase tracking-wider">{b.counter_id}</p>
                                            <p className="text-2xl font-bold text-emerald-400">₹{(b.current_balance || 0).toFixed(2)}</p>
                                            <p className="text-[10px] text-slate-600 mt-1">Updated: {b.last_updated ? new Date(b.last_updated).toLocaleString() : 'Never'}</p>
                                        </div>
                                    ))}
                                    {drawerSummary.balances.length === 0 && (
                                        <p className="text-slate-500 text-sm col-span-3">No drawer activity today</p>
                                    )}
                                </div>
                            </div>

                            {/* Drawer Entries Log */}
                            <div className="glass-card overflow-hidden">
                                <div className="p-4 border-b border-slate-800/50">
                                    <h3 className="text-sm font-semibold text-slate-200">Cash Movement Log (Today)</h3>
                                </div>
                                {drawerSummary.entries.length > 0 ? (
                                    <table className="data-table">
                                        <thead>
                                            <tr className="bg-slate-900/50">
                                                <th>Counter</th>
                                                <th>Cashier</th>
                                                <th>Type</th>
                                                <th>Amount</th>
                                                <th>Balance After</th>
                                                <th>Description</th>
                                                <th>Time</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {drawerSummary.entries.map((entry, i) => (
                                                <tr key={i}>
                                                    <td className="text-xs text-slate-400">{entry.counter_id}</td>
                                                    <td className="text-slate-200">{entry.cashier_name}</td>
                                                    <td>
                                                        <span className={`badge border ${entry.entry_type === 'cash_in' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                                                            entry.entry_type === 'change_out' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' :
                                                                entry.entry_type === 'forced_open' ? 'bg-red-500/20 text-red-400 border-red-500/30' :
                                                                    'bg-slate-500/20 text-slate-400 border-slate-500/30'
                                                            }`}>{entry.entry_type.replace(/_/g, ' ')}</span>
                                                    </td>
                                                    <td className={`font-semibold ${entry.amount >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                        {entry.amount >= 0 ? '+' : ''}₹{entry.amount.toFixed(2)}
                                                    </td>
                                                    <td className="font-mono text-slate-300">₹{entry.balance_after.toFixed(2)}</td>
                                                    <td className="text-xs text-slate-400 max-w-xs truncate">{entry.description || '—'}</td>
                                                    <td className="text-xs text-slate-400">{new Date(entry.timestamp).toLocaleTimeString()}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                ) : (
                                    <div className="p-8 text-center">
                                        <p className="text-4xl mb-2 opacity-30">💰</p>
                                        <p className="text-slate-500 text-sm">No cash movements recorded today</p>
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="glass-card p-12 text-center">
                            <p className="text-5xl mb-3 opacity-30">💰</p>
                            <p className="text-slate-400 text-sm font-medium">Drawer Balance</p>
                            <p className="text-slate-600 text-xs mt-1">No cash transactions have been processed yet. Start billing to see drawer activity.</p>
                        </div>
                    )}
                </div>
            )}

            {/* ═══════ AUDIT TRAIL — Professional Redesign ═══════ */}
            {view === 'audit' && (
                <div className="space-y-5">
                    {/* Integrity Banner */}
                    <div className="glass-card p-4" style={{
                        background: 'linear-gradient(135deg, #0f172a, #1e1b4b)',
                        borderColor: '#312e8150'
                    }}>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{
                                    background: 'linear-gradient(135deg, #3b82f620, #8b5cf620)',
                                    border: '1px solid #4338ca30'
                                }}>
                                    <span className="text-lg">🔐</span>
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-slate-100">Tamper-Proof Audit Chain</h3>
                                    <p className="text-[11px] text-slate-400">
                                        SHA-256 hash chain with append-only logging — each entry cryptographically linked to the previous
                                    </p>
                                </div>
                            </div>
                            <button onClick={async () => {
                                try {
                                    const result = await api.checkIntegrity();
                                    alert(result.valid
                                        ? `✅ Chain INTACT — ${result.total_entries} entries verified`
                                        : `🚨 Chain BROKEN at entry #${result.brokenAt}`);
                                } catch (e) { alert('Verification failed'); }
                            }}
                                className="px-4 py-2 rounded-lg text-xs font-semibold transition-all"
                                style={{
                                    background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                                    color: 'white',
                                    boxShadow: '0 4px 12px #3b82f630'
                                }}>
                                🔍 Verify Chain Integrity
                            </button>
                        </div>
                    </div>

                    {/* Stats Row */}
                    <div className="grid grid-cols-4 gap-3">
                        <div className="glass-card p-3 text-center">
                            <p className="text-[10px] text-slate-500 uppercase tracking-wider">Total Entries</p>
                            <p className="text-xl font-bold text-slate-200">{auditLog.length}</p>
                        </div>
                        <div className="glass-card p-3 text-center">
                            <p className="text-[10px] text-slate-500 uppercase tracking-wider">Unique Actions</p>
                            <p className="text-xl font-bold text-blue-400">
                                {new Set(auditLog.map(l => l.action)).size}
                            </p>
                        </div>
                        <div className="glass-card p-3 text-center">
                            <p className="text-[10px] text-slate-500 uppercase tracking-wider">Suspicious</p>
                            <p className="text-xl font-bold text-amber-400">
                                {auditLog.filter(l => ['voided', 'refunded', 'price_edited', 'drawer_forced'].includes(l.action)).length}
                            </p>
                        </div>
                        <div className="glass-card p-3 text-center">
                            <p className="text-[10px] text-slate-500 uppercase tracking-wider">Chain Status</p>
                            <p className="text-xl font-bold text-emerald-400">✅</p>
                        </div>
                    </div>

                    {/* Audit Entries */}
                    <div className="glass-card overflow-hidden">
                        <div className="p-4 border-b border-slate-800/50 flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-slate-200">📋 Transaction Audit Log</h3>
                            <span className="text-[10px] text-slate-500">{auditLog.length} records</span>
                        </div>
                        {auditLog.length > 0 ? (
                            <div className="divide-y divide-slate-800/20 max-h-[500px] overflow-y-auto">
                                {auditLog.map((log, idx) => {
                                    const actionStyles = {
                                        created: { bg: 'bg-blue-500/10', text: 'text-blue-400', icon: '📝' },
                                        completed: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', icon: '✅' },
                                        cash_payment: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', icon: '💵' },
                                        online_payment: { bg: 'bg-blue-500/10', text: 'text-blue-400', icon: '📱' },
                                        drawer_opened: { bg: 'bg-amber-500/10', text: 'text-amber-400', icon: '🗄️' },
                                        voided: { bg: 'bg-red-500/10', text: 'text-red-400', icon: '❌' },
                                        refunded: { bg: 'bg-orange-500/10', text: 'text-orange-400', icon: '↩️' },
                                        price_edited: { bg: 'bg-purple-500/10', text: 'text-purple-400', icon: '✏️' },
                                        drawer_forced: { bg: 'bg-red-500/10', text: 'text-red-400', icon: '⚠️' },
                                    };
                                    const style = actionStyles[log.action] || { bg: 'bg-slate-500/10', text: 'text-slate-400', icon: '📋' };
                                    const isSuspicious = ['voided', 'refunded', 'price_edited', 'drawer_forced'].includes(log.action);

                                    let details = '';
                                    try {
                                        if (log.details) {
                                            const d = JSON.parse(log.details);
                                            details = d.reason || d.payment_method || d.old_price ? `$${d.old_price} → $${d.new_price}` : JSON.stringify(d).substring(0, 80);
                                        }
                                    } catch { details = log.details || ''; }

                                    return (
                                        <div key={log.id} className={`px-4 py-3 flex items-center gap-4 hover:bg-slate-900/30 transition ${isSuspicious ? 'border-l-2 border-l-red-500' : ''}`}>
                                            {/* Chain Link */}
                                            <div className="flex flex-col items-center gap-0.5 w-6">
                                                <div className={`w-2 h-2 rounded-full ${isSuspicious ? 'bg-red-500' : 'bg-blue-500/50'}`} />
                                                {idx < auditLog.length - 1 && (
                                                    <div className="w-px h-6 bg-slate-700/50" />
                                                )}
                                            </div>

                                            {/* Entry # */}
                                            <span className="text-[10px] font-mono text-slate-600 w-6">#{log.id}</span>

                                            {/* Action Badge */}
                                            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border ${style.bg} border-current/10 min-w-[120px]`}>
                                                <span className="text-sm">{style.icon}</span>
                                                <span className={`text-xs font-semibold ${style.text}`}>
                                                    {log.action.replace(/_/g, ' ')}
                                                </span>
                                            </div>

                                            {/* Content */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs text-slate-200 font-medium">
                                                        {log.performed_by_name || 'System'}
                                                    </span>
                                                    {log.transaction_id && (
                                                        <span className="text-[10px] font-mono text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">
                                                            TXN:{log.transaction_id.substring(0, 8)}
                                                        </span>
                                                    )}
                                                </div>
                                                {details && (
                                                    <p className="text-[11px] text-slate-500 mt-0.5 truncate max-w-md">{details}</p>
                                                )}
                                            </div>

                                            {/* Hash */}
                                            <div className="text-right shrink-0">
                                                <div className="flex items-center gap-1 justify-end">
                                                    <span className="text-emerald-500 text-[10px]">🔗</span>
                                                    <span className="font-mono text-[10px] text-slate-600">
                                                        {log.hash ? log.hash.substring(0, 16) + '...' : 'N/A'}
                                                    </span>
                                                </div>
                                                <p className="text-[10px] text-slate-600 mt-0.5">
                                                    {new Date(log.timestamp).toLocaleString()}
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="p-12 text-center">
                                <p className="text-4xl mb-3 opacity-30">📋</p>
                                <p className="text-slate-400 text-sm font-medium">No Audit Entries Yet</p>
                                <p className="text-slate-600 text-xs mt-1">Transactions will be logged here with tamper-proof hash chains</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Risk Scores (always visible at bottom on monitoring) */}
            {view === 'monitoring' && riskScores.length > 0 && (
                <div className="glass-card p-6">
                    <h3 className="text-sm font-semibold text-slate-300 mb-4">📊 Cashier Risk Scores (24h)</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {riskScores.map((r, i) => (
                            <div key={i} className={`p-4 rounded-xl border ${r.combined_score >= 50 ? 'bg-red-500/10 border-red-500/20' :
                                r.combined_score >= 20 ? 'bg-amber-500/10 border-amber-500/20' :
                                    'bg-emerald-500/10 border-emerald-500/20'
                                }`}>
                                <p className="text-sm font-semibold text-slate-200">{r.cashier_name}</p>
                                <div className="grid grid-cols-3 gap-2 mt-2 text-center">
                                    <div>
                                        <p className="text-[10px] text-slate-500">SW</p>
                                        <p className={`text-lg font-bold ${getSeverityClass(r.software_score)}`}>{r.software_score}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-slate-500">PH</p>
                                        <p className={`text-lg font-bold ${getSeverityClass(r.physical_score)}`}>{r.physical_score}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-slate-500">Total</p>
                                        <p className={`text-lg font-bold ${getSeverityClass(r.combined_score)}`}>{r.combined_score}</p>
                                    </div>
                                </div>
                                <div className="risk-meter mt-2">
                                    <div className="risk-meter-fill" style={{
                                        width: `${r.combined_score}%`,
                                        backgroundColor: r.combined_score >= 50 ? '#ef4444' : r.combined_score >= 20 ? '#eab308' : '#22c55e'
                                    }} />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function SummaryCard({ label, value, icon, color }) {
    const colorClasses = {
        emerald: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
        amber: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
        blue: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
        red: 'bg-red-500/10 border-red-500/20 text-red-400',
        slate: 'bg-slate-800 border-slate-700 text-slate-300',
        cyan: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400',
    };
    return (
        <div className={`p-4 rounded-xl border ${colorClasses[color]}`}>
            <p className="text-xs text-slate-500 uppercase tracking-wider">{icon} {label}</p>
            <p className={`text-xl font-bold mt-1 ${colorClasses[color].split(' ').pop()}`}>{value}</p>
        </div>
    );
}
