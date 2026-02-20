import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';

export default function PhysicalTheftTab({ user, onRefresh }) {
    const [events, setEvents] = useState([]);
    const [alerts, setAlerts] = useState([]);
    const [cvStatus, setCvStatus] = useState(null);
    const [feedActive, setFeedActive] = useState(false);
    const [isSimulator, setIsSimulator] = useState(false);
    const [filter, setFilter] = useState({ event_type: '' });
    const [loading, setLoading] = useState(true);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [evts, alertData] = await Promise.all([
                api.getCameraEvents({ ...filter, limit: 50 }),
                api.getAlerts({ source: 'camera', limit: 30 }),
            ]);
            setEvents(evts);
            setAlerts(alertData);

            // Check CV service status
            const status = await api.cvStatus();
            setCvStatus(status);
            setFeedActive(status?.running || false);
            if (status?.running) setIsSimulator(status.simulator || false);
        } catch (err) {
            console.error('Failed to load physical theft data:', err);
        } finally {
            setLoading(false);
        }
    }, [filter]);

    useEffect(() => { loadData(); }, [loadData]);

    // Auto-refresh every 5s when feed is active
    useEffect(() => {
        if (!feedActive) return;
        const interval = setInterval(loadData, 5000);
        return () => clearInterval(interval);
    }, [feedActive, loadData]);

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
            console.error('Failed to toggle feed:', err);
        }
    };

    const getSeverityClass = (score) => {
        if (score >= 40) return 'severity-critical';
        if (score >= 25) return 'severity-high';
        if (score >= 10) return 'severity-medium';
        return 'severity-low';
    };

    const eventTypeConfig = {
        hand_to_pocket: { icon: '🤚', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30' },
        hand_hovering_drawer: { icon: '✋', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30' },
        drawer_opened_no_pos: { icon: '🗄️', color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/30' },
        drawer_forced_open: { icon: '💥', color: 'text-red-500', bg: 'bg-red-500/10 border-red-500/30' },
        suspicious_gesture: { icon: '👀', color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/30' },
        normal: { icon: '✅', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30' },
    };

    return (
        <div className="space-y-6">
            {/* Camera Feed + Controls */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Live Feed */}
                <div className="lg:col-span-2 glass-card overflow-hidden">
                    <div className="p-4 border-b border-slate-800/50 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${feedActive ? 'bg-red-500 animate-pulse' : 'bg-slate-600'}`} />
                            <h3 className="text-sm font-semibold text-slate-200">
                                {feedActive ? 'LIVE FEED' : 'Camera Feed (Offline)'}
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
                            <button
                                onClick={toggleFeed}
                                className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${feedActive
                                    ? 'bg-red-600/20 border border-red-500/30 text-red-400 hover:bg-red-600/30'
                                    : 'bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-600/30'
                                    }`}
                            >
                                {feedActive ? '⏹ Stop Feed' : '▶ Start Feed'}
                            </button>
                        </div>
                    </div>

                    {/* Video Feed Area */}
                    <div className="relative aspect-video bg-slate-900 flex items-center justify-center">
                        {feedActive ? (
                            <img
                                src={api.cvFeedUrl}
                                alt="Live Camera Feed"
                                className="w-full h-full object-contain"
                                onError={() => {
                                    // Feed might not be ready yet
                                }}
                            />
                        ) : (
                            <div className="text-center">
                                <p className="text-6xl mb-4 opacity-30">📹</p>
                                <p className="text-slate-500 text-sm">Camera feed is offline</p>
                                <p className="text-slate-600 text-xs mt-1">Click "Start Feed" to begin monitoring</p>
                            </div>
                        )}

                        {/* Overlay indicators */}
                        {feedActive && (
                            <div className="absolute top-3 left-3 flex items-center gap-2">
                                <span className="px-2 py-1 rounded bg-red-600/80 text-white text-xs font-bold flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                                    REC
                                </span>
                                {cvStatus && (
                                    <span className="px-2 py-1 rounded bg-black/50 text-slate-300 text-xs">
                                        Frame: {cvStatus.frame_count} | Events: {cvStatus.total_events}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Real-time Alerts Panel */}
                <div className="glass-card overflow-hidden flex flex-col">
                    <div className="p-4 border-b border-slate-800/50">
                        <h3 className="text-sm font-semibold text-slate-200">🚨 Real-Time Alerts</h3>
                        <p className="text-[10px] text-slate-500 mt-1">Latest camera-detected events</p>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3 space-y-2 max-h-[400px]">
                        {alerts.slice(0, 15).map(alert => {
                            const config = eventTypeConfig[alert.title?.split(': ')[1]?.replace(/ /g, '_')] || eventTypeConfig.suspicious_gesture;
                            return (
                                <div key={alert.id} className={`p-3 rounded-lg border ${config.bg} transition-all hover:scale-[1.01]`}>
                                    <div className="flex items-start gap-2">
                                        <span className="text-lg">{config.icon}</span>
                                        <div className="flex-1 min-w-0">
                                            <p className={`text-xs font-semibold ${config.color}`}>{alert.title}</p>
                                            <p className="text-[11px] text-slate-400 truncate">{alert.description}</p>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className={`text-[10px] font-mono font-bold ${getSeverityClass(alert.risk_score)}`}>
                                                    Risk: {alert.risk_score.toFixed(0)}
                                                </span>
                                                <span className="text-[10px] text-slate-600">
                                                    {new Date(alert.created_at).toLocaleTimeString()}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                        {alerts.length === 0 && (
                            <p className="text-center text-slate-600 text-sm py-8">No camera alerts yet</p>
                        )}
                    </div>
                </div>
            </div>

            {/* Event Timeline */}
            <div className="glass-card overflow-hidden">
                <div className="p-4 border-b border-slate-800/50 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-200">📋 Event Timeline</h3>
                    <div className="flex items-center gap-2">
                        <select
                            value={filter.event_type}
                            onChange={e => setFilter(f => ({ ...f, event_type: e.target.value }))}
                            className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-300"
                        >
                            <option value="">All Events</option>
                            <option value="hand_to_pocket">Hand to Pocket</option>
                            <option value="hand_hovering_drawer">Hand Hovering</option>
                            <option value="drawer_opened_no_pos">Drawer (No POS)</option>
                            <option value="drawer_forced_open">Forced Open</option>
                            <option value="suspicious_gesture">Suspicious Gesture</option>
                            <option value="normal">Normal</option>
                        </select>
                        <button onClick={loadData}
                            className="px-3 py-1.5 rounded-lg bg-slate-800 text-xs text-slate-400 hover:text-white transition">
                            ↻
                        </button>
                    </div>
                </div>

                <table className="data-table">
                    <thead>
                        <tr className="bg-slate-900/50">
                            <th>Event</th>
                            <th>Type</th>
                            <th>Confidence</th>
                            <th>Risk Score</th>
                            <th>Description</th>
                            <th>Linked TXN</th>
                            <th>Timestamp</th>
                        </tr>
                    </thead>
                    <tbody>
                        {events.map(evt => {
                            const config = eventTypeConfig[evt.event_type] || eventTypeConfig.normal;
                            return (
                                <tr key={evt.id} className={evt.risk_score > 30 ? 'bg-red-950/10' : ''}>
                                    <td>
                                        <span className="text-lg">{config.icon}</span>
                                    </td>
                                    <td>
                                        <span className={`badge border ${config.bg} ${config.color}`}>
                                            {evt.event_type.replace(/_/g, ' ')}
                                        </span>
                                    </td>
                                    <td>
                                        <div className="flex items-center gap-2">
                                            <div className="risk-meter w-12">
                                                <div className="risk-meter-fill bg-blue-500" style={{ width: `${(evt.confidence || 0) * 100}%` }} />
                                            </div>
                                            <span className="text-xs text-slate-400">{((evt.confidence || 0) * 100).toFixed(0)}%</span>
                                        </div>
                                    </td>
                                    <td>
                                        <span className={`text-xs font-mono font-bold ${getSeverityClass(evt.risk_score)}`}>
                                            {evt.risk_score.toFixed(1)}
                                        </span>
                                    </td>
                                    <td className="text-xs text-slate-400 max-w-xs truncate">{evt.description || '—'}</td>
                                    <td className="font-mono text-[10px] text-slate-600">
                                        {evt.linked_transaction_id ? evt.linked_transaction_id.substring(0, 8) + '...' : '—'}
                                    </td>
                                    <td className="text-xs text-slate-400">{new Date(evt.timestamp).toLocaleString()}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>

                {events.length === 0 && (
                    <div className="p-8 text-center text-slate-500">
                        {loading ? 'Loading events...' : 'No camera events found'}
                    </div>
                )}
            </div>

            {/* Event Type Distribution */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {Object.entries(eventTypeConfig).map(([type, config]) => {
                    const count = events.filter(e => e.event_type === type).length;
                    return (
                        <div key={type} className={`glass-card p-4 text-center border ${count > 0 ? config.bg : 'border-slate-800/30'}`}>
                            <span className="text-2xl">{config.icon}</span>
                            <p className={`text-2xl font-bold mt-2 ${count > 0 ? config.color : 'text-slate-600'}`}>{count}</p>
                            <p className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">
                                {type.replace(/_/g, ' ')}
                            </p>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
