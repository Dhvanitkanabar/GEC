import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../services/api';

export default function PhysicalTheftTab({ user }) {
    const [activeClip, setActiveClip] = useState(null);
    const [events, setEvents] = useState([]);
    const [alerts, setAlerts] = useState([]);
    const [cvStatus, setCvStatus] = useState(null);
    const [feedActive, setFeedActive] = useState(false);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState({
        date: new Date().toISOString().split('T')[0],
        event_type: ''
    });
    const lastAlertRef = useRef(null);
    const imgRef = useRef(null);

    // ── Audio beep ────────────────────────────────────────────────────────────
    const playBeep = useCallback((type = 'alert') => {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = type === 'currency' ? 'sawtooth' : 'square';
            osc.frequency.value = type === 'currency' ? 660 : 880;
            gain.gain.value = 0.4;
            osc.start();
            gain.gain.setValueAtTime(0.4, ctx.currentTime);
            gain.gain.setValueAtTime(0, ctx.currentTime + 0.15);
            gain.gain.setValueAtTime(0.4, ctx.currentTime + 0.25);
            gain.gain.setValueAtTime(0, ctx.currentTime + 0.45);
            if (type === 'currency') {
                gain.gain.setValueAtTime(0.4, ctx.currentTime + 0.55);
                gain.gain.setValueAtTime(0, ctx.currentTime + 0.75);
            }
            osc.stop(ctx.currentTime + 0.9);
        } catch { /* silent */ }
    }, []);

    // ── Data loader ───────────────────────────────────────────────────────────
    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [evts, alertData, status] = await Promise.all([
                api.getCameraEvents({ ...filter, limit: 50 }),
                api.getAlerts({ source: 'camera', limit: 30 }),
                api.cvStatus(),
            ]);
            setEvents(evts);
            setAlerts(alertData);
            setCvStatus(status);
            setFeedActive(status?.running || false);

            // Beep on new unacknowledged alerts
            const newCritical = alertData.find(a => !a.acknowledged &&
                (a.severity === 'critical' || a.severity === 'high'));
            if (newCritical && newCritical.id !== lastAlertRef.current) {
                lastAlertRef.current = newCritical.id;
                const isCurrency = newCritical.title?.toLowerCase().includes('currency');
                playBeep(isCurrency ? 'currency' : 'alert');
            }
        } catch (err) {
            console.error('Failed to load physical theft data:', err);
        } finally {
            setLoading(false);
        }
    }, [filter, playBeep]);

    // Auto-start camera on mount
    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                const status = await api.cvStatus();
                if (!status || !status.running) {
                    await api.cvStart(false);
                    if (mounted) setFeedActive(true);
                } else {
                    if (mounted) setFeedActive(true);
                }
            } catch (e) {
                console.debug('CV start failed:', e);
            }
        })();
        return () => { mounted = false; };
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    // Auto-refresh every 5s
    useEffect(() => {
        const interval = setInterval(loadData, 5000);
        return () => clearInterval(interval);
    }, [loadData]);

    // Reconnect img tag if stream drops
    useEffect(() => {
        if (!feedActive || !imgRef.current) return;
        const img = imgRef.current;
        const onError = () => {
            setTimeout(() => {
                if (img) img.src = `${api.cvFeedUrl}?t=${Date.now()}`;
            }, 2000);
        };
        img.addEventListener('error', onError);
        return () => img.removeEventListener('error', onError);
    }, [feedActive]);

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
        currency_anomaly: { icon: '💵', color: 'text-red-400', bg: 'bg-red-500/20 border-red-500/50' },
        cash_picked_correct: { icon: '✅', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30' },
        normal: { icon: '✔', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30' },
    };

    // Compute optimal notes display from cvStatus
    const optimalNotes = cvStatus?.optimal_notes || [];
    const pickedNotes = cvStatus?.picked_notes || [];
    const expectedChange = cvStatus?.expected_change || 0;

    return (
        <div className="space-y-6">
            {/* Video Clip Modal */}
            {activeClip && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="glass-card w-full max-w-3xl overflow-hidden">
                        <div className="p-4 border-b border-white/10 flex items-center justify-between bg-slate-900">
                            <h3 className="text-sm font-bold text-white">🎬 Anomaly Video Audit — 20s Clip</h3>
                            <button onClick={() => setActiveClip(null)} className="text-slate-400 hover:text-white text-xl">✕</button>
                        </div>
                        <div className="aspect-video bg-black">
                            <video src={`${api.baseUrl}${activeClip}`} controls autoPlay className="w-full h-full" />
                        </div>
                        <div className="p-4 bg-slate-900 border-t border-white/10 text-center">
                            <p className="text-xs text-slate-400">20-second clip auto-saved surrounding the detected anomaly event.</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Camera Feed + Currency Panel */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Live Feed */}
                <div className="lg:col-span-2 glass-card overflow-hidden">
                    <div className="p-4 border-b border-slate-800/50 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${feedActive ? 'bg-red-500 animate-pulse' : 'bg-slate-600'}`} />
                            <h3 className="text-sm font-semibold text-slate-200">
                                {feedActive ? 'LIVE DETECTION FEED' : 'Camera Feed (Connecting...)'}
                            </h3>
                        </div>
                        <span className="text-[10px] text-emerald-400 uppercase font-bold tracking-widest bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20">
                            Always-On
                        </span>
                    </div>

                    <div className="relative aspect-video bg-slate-950">
                        {/* Always show the MJPEG stream — it serves an offline frame if no camera */}
                        <img
                            ref={imgRef}
                            src={`${api.cvFeedUrl}`}
                            alt="Live Camera Feed"
                            className="w-full h-full object-contain"
                            onLoad={() => setFeedActive(true)}
                        />

                        {/* REC badge overlay */}
                        <div className="absolute top-3 left-3 flex items-center gap-2 pointer-events-none">
                            <span className="px-2 py-1 rounded bg-red-600/80 text-white text-xs font-bold flex items-center gap-1">
                                <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" /> REC
                            </span>
                            {cvStatus && (
                                <span className="px-2 py-1 rounded bg-black/60 text-slate-300 text-xs">
                                    F:{cvStatus.frame_count} | E:{cvStatus.total_events}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Currency Change Info Panel */}
                    <div className="p-4 border-t border-slate-800/50 bg-slate-900/40">
                        <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">💰 AI Currency Monitor</p>
                        {expectedChange > 0 ? (
                            <div className="grid grid-cols-3 gap-3">
                                <div className="rounded-lg bg-slate-800/60 p-2 text-center">
                                    <p className="text-[10px] text-slate-500">Change Due</p>
                                    <p className="text-base font-bold text-amber-400">₹{expectedChange}</p>
                                </div>
                                <div className="rounded-lg bg-slate-800/60 p-2 text-center">
                                    <p className="text-[10px] text-slate-500">Optimal Notes</p>
                                    <p className="text-xs font-semibold text-emerald-400">
                                        {optimalNotes.length > 0 ? optimalNotes.map(n => `₹${n}`).join(' + ') : '—'}
                                    </p>
                                </div>
                                <div className="rounded-lg bg-slate-800/60 p-2 text-center">
                                    <p className="text-[10px] text-slate-500">Picked So Far</p>
                                    <p className="text-xs font-semibold text-blue-400">
                                        {pickedNotes.length > 0 ? pickedNotes.map(n => `₹${n}`).join(' + ') : 'None yet'}
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <p className="text-xs text-slate-600">No active transaction — monitoring for suspicious activity</p>
                        )}

                        {/* Note denomination legend */}
                        <div className="flex flex-wrap gap-2 mt-3">
                            {[10, 20, 50, 100, 200, 500].map(n => (
                                <span key={n}
                                    className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition-all ${pickedNotes.includes(n)
                                            ? optimalNotes.includes(n)
                                                ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                                                : 'bg-red-500/20 border-red-400 text-red-300'
                                            : optimalNotes.includes(n)
                                                ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                                                : 'bg-slate-800 border-slate-700 text-slate-500'
                                        }`}>
                                    ₹{n}
                                </span>
                            ))}
                            <span className="text-[10px] text-slate-600 self-center ml-1">
                                {optimalNotes.length > 0 ? '● needed  ' : ''}
                                {pickedNotes.length > 0 ? '● picked' : ''}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Real-time Alerts Panel */}
                <div className="glass-card overflow-hidden flex flex-col">
                    <div className="p-4 border-b border-slate-800/50">
                        <h3 className="text-sm font-semibold text-slate-200">🚨 Live Alerts</h3>
                        <p className="text-[10px] text-slate-500 mt-1">Audio beep on suspicious activity</p>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3 space-y-2 max-h-[500px]">
                        {alerts.slice(0, 20).map(alert => {
                            const isCurrency = alert.title?.toLowerCase().includes('currency') || alert.title?.toLowerCase().includes('note');
                            const config = isCurrency ? eventTypeConfig.currency_anomaly : eventTypeConfig.suspicious_gesture;
                            return (
                                <div key={alert.id} className={`p-3 rounded-lg border ${config.bg} transition-all ${alert.severity === 'critical' ? 'animate-pulse' : ''
                                    }`}>
                                    <div className="flex items-start gap-2">
                                        <span className="text-lg">{config.icon}</span>
                                        <div className="flex-1 min-w-0">
                                            <p className={`text-xs font-bold ${config.color}`}>{alert.title}</p>
                                            <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">{alert.description}</p>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className={`text-[10px] font-mono font-bold ${getSeverityClass(alert.risk_score)}`}>
                                                    Risk: {alert.risk_score?.toFixed(0)}
                                                </span>
                                                <span className="text-[10px] text-slate-600">
                                                    {new Date(alert.created_at).toLocaleTimeString()}
                                                </span>
                                            </div>
                                            {alert.clip_path && (
                                                <button
                                                    onClick={() => setActiveClip(alert.clip_path)}
                                                    className="mt-2 flex items-center gap-1 bg-white/10 hover:bg-white/20 border border-white/10 px-2 py-1 rounded text-[10px] font-bold text-white transition"
                                                >
                                                    🎬 View 20s Clip
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                        {alerts.length === 0 && (
                            <div className="text-center py-10">
                                <p className="text-4xl opacity-20 mb-2">✅</p>
                                <p className="text-slate-600 text-sm">No camera alerts detected</p>
                            </div>
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
                            <option value="drawer_forced_open">Forced Open</option>
                            <option value="suspicious_gesture">Suspicious Gesture</option>
                            <option value="currency_anomaly">💵 Currency Anomaly</option>
                            <option value="cash_picked_correct">✅ Correct Pick</option>
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
                            <th>Icon</th>
                            <th>Type</th>
                            <th>Confidence</th>
                            <th>Risk</th>
                            <th>Description</th>
                            <th>Timestamp</th>
                            <th>Clip</th>
                        </tr>
                    </thead>
                    <tbody>
                        {events.map(evt => {
                            const config = eventTypeConfig[evt.event_type] || eventTypeConfig.normal;
                            return (
                                <tr key={evt.id} className={evt.risk_score > 30 ? 'bg-red-950/10' : evt.event_type === 'currency_anomaly' ? 'bg-red-950/15' : ''}>
                                    <td><span className="text-lg">{config.icon}</span></td>
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
                                            {evt.risk_score?.toFixed(1)}
                                        </span>
                                    </td>
                                    <td className="text-xs text-slate-400 max-w-sm">{evt.description || '—'}</td>
                                    <td className="text-xs text-slate-400">{new Date(evt.timestamp).toLocaleString()}</td>
                                    <td>
                                        {(evt.frame_path || evt.clip_path) && (
                                            <button
                                                onClick={() => setActiveClip(evt.frame_path || evt.clip_path)}
                                                className="bg-blue-600/20 text-blue-400 border border-blue-500/30 px-2 py-1 rounded text-[10px] font-bold hover:bg-blue-600/30 transition"
                                            >
                                                🎬 View
                                            </button>
                                        )}
                                    </td>
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

            {/* Event Distribution Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
                {Object.entries(eventTypeConfig).map(([type, config]) => {
                    const count = events.filter(e => e.event_type === type).length;
                    return (
                        <div key={type} className={`glass-card p-3 text-center border ${count > 0 ? config.bg : 'border-slate-800/30'} cursor-pointer hover:scale-[1.02] transition-transform`}
                            onClick={() => setFilter(f => ({ ...f, event_type: f.event_type === type ? '' : type }))}>
                            <span className="text-2xl">{config.icon}</span>
                            <p className={`text-xl font-bold mt-1 ${count > 0 ? config.color : 'text-slate-600'}`}>{count}</p>
                            <p className="text-[9px] text-slate-500 uppercase tracking-wider mt-1 leading-tight">
                                {type.replace(/_/g, ' ')}
                            </p>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
