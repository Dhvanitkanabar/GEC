import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';

const CATEGORY_META = {
    unauthorized_drawer_open: { icon: '🔓', color: '#ff6b6b', gradient: 'linear-gradient(135deg, #ff6b6b22, #ee555522)' },
    phantom_transaction: { icon: '👻', color: '#a855f7', gradient: 'linear-gradient(135deg, #a855f722, #7c3aed22)' },
    void_refund_cover: { icon: '🔄', color: '#f59e0b', gradient: 'linear-gradient(135deg, #f59e0b22, #d9770622)' },
    discount_abuse: { icon: '💸', color: '#10b981', gradient: 'linear-gradient(135deg, #10b98122, #05966422)' },
    log_tampering: { icon: '🛡️', color: '#ef4444', gradient: 'linear-gradient(135deg, #ef444422, #dc262622)' },
    drawer_no_transaction: { icon: '📭', color: '#3b82f6', gradient: 'linear-gradient(135deg, #3b82f622, #2563eb22)' },
    time_manipulation: { icon: '⏰', color: '#ec4899', gradient: 'linear-gradient(135deg, #ec489922, #db277722)' },
    cross_source_correlation: { icon: '🔗', color: '#06b6d4', gradient: 'linear-gradient(135deg, #06b6d422, #0891b222)' },
};

const SEVERITY_COLORS = {
    critical: { bg: '#ef444425', border: '#ef4444', text: '#fca5a5', badge: '#ef4444' },
    high: { bg: '#f59e0b25', border: '#f59e0b', text: '#fcd34d', badge: '#f59e0b' },
    medium: { bg: '#3b82f625', border: '#3b82f6', text: '#93c5fd', badge: '#3b82f6' },
    low: { bg: '#10b98125', border: '#10b981', text: '#6ee7b7', badge: '#10b981' },
    clear: { bg: '#6b728025', border: '#6b7280', text: '#9ca3af', badge: '#6b7280' },
};

export default function SoftwareTheftTab() {
    const [scanResult, setScanResult] = useState(null);
    const [integrity, setIntegrity] = useState(null);
    const [loading, setLoading] = useState(false);
    const [scanning, setScanning] = useState(false);
    const [scanProgress, setScanProgress] = useState(0);
    const [selectedCategory, setSelectedCategory] = useState(null);
    const [hoursBack, setHoursBack] = useState(24);

    const runScan = useCallback(async () => {
        setScanning(true);
        setScanProgress(0);

        // Animate progress
        const interval = setInterval(() => {
            setScanProgress(p => Math.min(p + Math.random() * 15, 90));
        }, 200);

        try {
            const [scan, chain] = await Promise.all([
                api.scanAnomalies(hoursBack),
                api.checkIntegrity(),
            ]);
            setScanResult(scan);
            setIntegrity(chain);
            setScanProgress(100);
        } catch (err) {
            console.error('Scan failed:', err);
        } finally {
            clearInterval(interval);
            setTimeout(() => setScanning(false), 500);
        }
    }, [hoursBack]);

    useEffect(() => {
        setLoading(true);
        runScan().finally(() => setLoading(false));
    }, []);

    const prosecutionColor = (score) => {
        if (score >= 80) return '#ef4444';
        if (score >= 50) return '#f59e0b';
        if (score >= 20) return '#3b82f6';
        return '#10b981';
    };

    return (
        <div style={{ padding: '24px', maxWidth: 1400, margin: '0 auto' }}>
            {/* ═══ HEADER ═══ */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <div>
                    <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f1f5f9', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 28 }}>🛡️</span> Software / POS Log Anomaly Detection
                    </h2>
                    <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 4 }}>
                        Treats the POS log as an <b style={{ color: '#f59e0b' }}>untrusted input</b> — Video feed and log validate each other bidirectionally
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <select value={hoursBack} onChange={e => setHoursBack(+e.target.value)}
                        style={{ background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
                        <option value={1}>Last 1 hour</option>
                        <option value={6}>Last 6 hours</option>
                        <option value={12}>Last 12 hours</option>
                        <option value={24}>Last 24 hours</option>
                        <option value={48}>Last 48 hours</option>
                        <option value={168}>Last 7 days</option>
                    </select>
                    <button onClick={runScan} disabled={scanning}
                        style={{
                            background: scanning ? '#334155' : 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                            color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px',
                            fontWeight: 600, cursor: scanning ? 'wait' : 'pointer', fontSize: 13,
                            display: 'flex', alignItems: 'center', gap: 8,
                            boxShadow: scanning ? 'none' : '0 4px 15px #3b82f640',
                            transition: 'all 0.3s',
                        }}>
                        {scanning ? '⏳ Scanning...' : '🔍 Run Anomaly Scan'}
                    </button>
                </div>
            </div>

            {/* ═══ SCAN PROGRESS BAR ═══ */}
            {scanning && (
                <div style={{ marginBottom: 20, background: '#0f172a', borderRadius: 12, padding: 16, border: '1px solid #1e293b' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{ color: '#94a3b8', fontSize: 13 }}>Analyzing POS logs, camera events, hash chains...</span>
                        <span style={{ color: '#3b82f6', fontWeight: 600, fontSize: 13 }}>{Math.round(scanProgress)}%</span>
                    </div>
                    <div style={{ background: '#1e293b', borderRadius: 6, height: 6, overflow: 'hidden' }}>
                        <div style={{
                            width: `${scanProgress}%`, height: '100%',
                            background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)',
                            borderRadius: 6, transition: 'width 0.3s ease',
                        }} />
                    </div>
                </div>
            )}

            {scanResult && (
                <>
                    {/* ═══ TOP METRICS ROW ═══ */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
                        {/* Prosecution Score */}
                        <div style={{
                            background: '#0f172a', borderRadius: 16, padding: 20,
                            border: `1px solid ${prosecutionColor(scanResult.prosecution_score)}40`,
                            display: 'flex', flexDirection: 'column', alignItems: 'center',
                            position: 'relative', overflow: 'hidden',
                        }}>
                            <div style={{
                                position: 'absolute', top: 0, left: 0, right: 0, height: 3,
                                background: `linear-gradient(90deg, ${prosecutionColor(scanResult.prosecution_score)}, transparent)`,
                            }} />
                            <span style={{ color: '#94a3b8', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                                Prosecution Probability
                            </span>
                            <span style={{
                                fontSize: 42, fontWeight: 800, color: prosecutionColor(scanResult.prosecution_score),
                                lineHeight: 1,
                            }}>
                                {scanResult.prosecution_score}%
                            </span>
                            <span style={{ color: '#64748b', fontSize: 11, marginTop: 4 }}>
                                Combined confidence score
                            </span>
                        </div>

                        {/* Total Anomalies */}
                        <div style={{
                            background: '#0f172a', borderRadius: 16, padding: 20, border: '1px solid #1e293b',
                            display: 'flex', flexDirection: 'column', alignItems: 'center',
                        }}>
                            <span style={{ color: '#94a3b8', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                                Total Anomalies
                            </span>
                            <span style={{ fontSize: 42, fontWeight: 800, color: '#f1f5f9', lineHeight: 1 }}>
                                {scanResult.total_anomalies}
                            </span>
                            <span style={{ color: '#64748b', fontSize: 11, marginTop: 4 }}>
                                Last {hoursBack}h window
                            </span>
                        </div>

                        {/* Chain Integrity */}
                        <div style={{
                            background: '#0f172a', borderRadius: 16, padding: 20,
                            border: `1px solid ${integrity?.valid ? '#10b98140' : '#ef444440'}`,
                            display: 'flex', flexDirection: 'column', alignItems: 'center',
                        }}>
                            <span style={{ color: '#94a3b8', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                                Hash Chain
                            </span>
                            <span style={{ fontSize: 28, lineHeight: 1, marginBottom: 4 }}>
                                {integrity?.valid ? '✅' : '🚨'}
                            </span>
                            <span style={{
                                color: integrity?.valid ? '#10b981' : '#ef4444',
                                fontWeight: 700, fontSize: 16,
                            }}>
                                {integrity?.valid ? 'INTACT' : 'BROKEN'}
                            </span>
                            <span style={{ color: '#64748b', fontSize: 11 }}>
                                {integrity?.total_entries || 0} entries verified
                            </span>
                        </div>

                        {/* Scan Time */}
                        <div style={{
                            background: '#0f172a', borderRadius: 16, padding: 20, border: '1px solid #1e293b',
                            display: 'flex', flexDirection: 'column', alignItems: 'center',
                        }}>
                            <span style={{ color: '#94a3b8', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                                Categories Scanned
                            </span>
                            <span style={{ fontSize: 42, fontWeight: 800, color: '#f1f5f9', lineHeight: 1 }}>
                                8
                            </span>
                            <span style={{ color: '#64748b', fontSize: 11, marginTop: 4 }}>
                                Detection engines active
                            </span>
                        </div>
                    </div>

                    {/* ═══ KEY INSIGHT BANNER ═══ */}
                    <div style={{
                        background: 'linear-gradient(135deg, #1e1b4b, #312e81)',
                        borderRadius: 12, padding: '14px 20px', marginBottom: 24,
                        border: '1px solid #4338ca40',
                        display: 'flex', alignItems: 'center', gap: 12,
                    }}>
                        <span style={{ fontSize: 20 }}>💡</span>
                        <span style={{ color: '#c7d2fe', fontSize: 13, lineHeight: 1.5 }}>
                            <b style={{ color: '#e0e7ff' }}>Key Insight:</b> Neither POS logs nor camera feeds alone are sufficient.
                            A single void is noise — but a void pattern combined with phantom velocity creates a <b style={{ color: '#fbbf24' }}>95% confidence fraud event</b>.
                            The score is your prosecution probability.
                        </span>
                    </div>

                    {/* ═══ 8-CATEGORY BREAKDOWN ═══ */}
                    <h3 style={{ color: '#e2e8f0', fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
                        Detection Categories
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
                        {Object.entries(scanResult.summary).map(([key, cat]) => {
                            const meta = CATEGORY_META[key] || {};
                            const sevColor = SEVERITY_COLORS[cat.severity] || SEVERITY_COLORS.clear;
                            const isSelected = selectedCategory === key;
                            return (
                                <div key={key} onClick={() => setSelectedCategory(isSelected ? null : key)}
                                    style={{
                                        background: isSelected ? meta.gradient || '#0f172a' : '#0f172a',
                                        borderRadius: 12, padding: 16, cursor: 'pointer',
                                        border: `1px solid ${isSelected ? (meta.color || '#334155') : '#1e293b'}`,
                                        transition: 'all 0.25s',
                                        transform: isSelected ? 'scale(1.02)' : 'scale(1)',
                                    }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                        <span style={{ fontSize: 24 }}>{meta.icon}</span>
                                        <span style={{
                                            background: sevColor.bg, color: sevColor.badge,
                                            padding: '2px 8px', borderRadius: 6, fontSize: 10,
                                            fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
                                        }}>{cat.severity}</span>
                                    </div>
                                    <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 600, marginBottom: 6, lineHeight: 1.3 }}>
                                        {cat.label}
                                    </div>
                                    <div style={{ fontSize: 28, fontWeight: 800, color: meta.color || '#f1f5f9' }}>
                                        {cat.count}
                                    </div>
                                    <div style={{ color: '#64748b', fontSize: 11 }}>
                                        anomalies detected
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* ═══ SELECTED CATEGORY DETAIL ═══ */}
                    {selectedCategory && scanResult.summary[selectedCategory] && (
                        <div style={{
                            background: '#0f172a', borderRadius: 16, padding: 20, marginBottom: 24,
                            border: `1px solid ${CATEGORY_META[selectedCategory]?.color || '#334155'}40`,
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                                <span style={{ fontSize: 24 }}>{CATEGORY_META[selectedCategory]?.icon}</span>
                                <h3 style={{ color: '#f1f5f9', fontSize: 16, fontWeight: 700, margin: 0 }}>
                                    {scanResult.summary[selectedCategory].label} — Detail View
                                </h3>
                                <span style={{
                                    marginLeft: 'auto', background: SEVERITY_COLORS[scanResult.summary[selectedCategory].severity]?.bg,
                                    color: SEVERITY_COLORS[scanResult.summary[selectedCategory].severity]?.badge,
                                    padding: '4px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                                }}>
                                    {scanResult.summary[selectedCategory].count} found
                                </span>
                            </div>

                            {scanResult.summary[selectedCategory].items.length === 0 ? (
                                <div style={{ color: '#10b981', textAlign: 'center', padding: 30, fontSize: 14 }}>
                                    ✅ No anomalies detected in this category
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {scanResult.summary[selectedCategory].items.map((item, idx) => (
                                        <div key={idx} style={{
                                            background: '#1e293b', borderRadius: 10, padding: '12px 16px',
                                            borderLeft: `3px solid ${SEVERITY_COLORS[item.severity]?.badge || '#6b7280'}`,
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                <div>
                                                    <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
                                                        {item.description}
                                                    </div>
                                                    <div style={{ color: '#94a3b8', fontSize: 11, display: 'flex', gap: 16 }}>
                                                        <span>👤 {item.cashier}</span>
                                                        {item.transaction_id && <span>🧾 {item.transaction_id.slice(0, 8)}...</span>}
                                                        <span>🕐 {new Date(item.timestamp).toLocaleString()}</span>
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                                                    <div style={{ textAlign: 'center' }}>
                                                        <div style={{ color: '#94a3b8', fontSize: 9, textTransform: 'uppercase' }}>Confidence</div>
                                                        <div style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 14 }}>
                                                            {(item.confidence * 100).toFixed(0)}%
                                                        </div>
                                                    </div>
                                                    <span style={{
                                                        background: SEVERITY_COLORS[item.severity]?.bg,
                                                        color: SEVERITY_COLORS[item.severity]?.badge,
                                                        padding: '2px 8px', borderRadius: 6, fontSize: 10,
                                                        fontWeight: 700, textTransform: 'uppercase',
                                                    }}>{item.severity}</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ═══ ANOMALY TIMELINE ═══ */}
                    <h3 style={{ color: '#e2e8f0', fontSize: 16, fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>📋</span> Anomaly Timeline
                        <span style={{ fontSize: 12, color: '#64748b', fontWeight: 400 }}>
                            ({scanResult.anomalies.length} events)
                        </span>
                    </h3>

                    {scanResult.anomalies.length === 0 ? (
                        <div style={{
                            background: '#0f172a', borderRadius: 16, padding: 40,
                            textAlign: 'center', border: '1px solid #1e293b',
                        }}>
                            <div style={{ fontSize: 48, marginBottom: 12 }}>✨</div>
                            <div style={{ color: '#10b981', fontSize: 18, fontWeight: 700, marginBottom: 4 }}>All Clear</div>
                            <div style={{ color: '#64748b', fontSize: 13 }}>
                                No anomalies detected in the last {hoursBack} hours. POS logs and camera data are consistent.
                            </div>
                        </div>
                    ) : (
                        <div style={{
                            background: '#0f172a', borderRadius: 16, border: '1px solid #1e293b',
                            maxHeight: 500, overflowY: 'auto',
                        }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid #1e293b' }}>
                                        {['Category', 'Description', 'Cashier', 'Confidence', 'Severity', 'Time'].map(h => (
                                            <th key={h} style={{
                                                padding: '12px 14px', color: '#94a3b8', fontWeight: 600,
                                                textAlign: 'left', fontSize: 11, textTransform: 'uppercase',
                                                letterSpacing: 0.5, position: 'sticky', top: 0, background: '#0f172a',
                                            }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {scanResult.anomalies.slice(0, 50).map((a, i) => {
                                        const meta = CATEGORY_META[a.category] || {};
                                        const sev = SEVERITY_COLORS[a.severity] || SEVERITY_COLORS.low;
                                        return (
                                            <tr key={i} style={{
                                                borderBottom: '1px solid #1e293b15',
                                                transition: 'background 0.15s',
                                            }}
                                                onMouseEnter={e => e.currentTarget.style.background = '#1e293b40'}
                                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                            >
                                                <td style={{ padding: '10px 14px' }}>
                                                    <span style={{ marginRight: 6 }}>{meta.icon}</span>
                                                    <span style={{ color: meta.color || '#94a3b8', fontWeight: 500, fontSize: 12 }}>
                                                        {a.category_label}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '10px 14px', color: '#e2e8f0', maxWidth: 300 }}>
                                                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {a.description}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '10px 14px', color: '#94a3b8' }}>{a.cashier}</td>
                                                <td style={{ padding: '10px 14px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        <div style={{
                                                            width: 40, height: 4, background: '#1e293b', borderRadius: 2,
                                                            overflow: 'hidden',
                                                        }}>
                                                            <div style={{
                                                                width: `${a.confidence * 100}%`, height: '100%',
                                                                background: sev.badge, borderRadius: 2,
                                                            }} />
                                                        </div>
                                                        <span style={{ color: '#e2e8f0', fontWeight: 600 }}>
                                                            {(a.confidence * 100).toFixed(0)}%
                                                        </span>
                                                    </div>
                                                </td>
                                                <td style={{ padding: '10px 14px' }}>
                                                    <span style={{
                                                        background: sev.bg, color: sev.badge,
                                                        padding: '2px 8px', borderRadius: 6, fontSize: 10,
                                                        fontWeight: 700, textTransform: 'uppercase',
                                                    }}>{a.severity}</span>
                                                </td>
                                                <td style={{ padding: '10px 14px', color: '#94a3b8', fontSize: 12, whiteSpace: 'nowrap' }}>
                                                    {new Date(a.timestamp).toLocaleTimeString()}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* ═══ CROSS-SOURCE INSIGHT ═══ */}
                    <div style={{
                        background: '#0f172a', borderRadius: 16, padding: 20, marginTop: 24,
                        border: '1px solid #1e293b',
                    }}>
                        <h3 style={{ color: '#e2e8f0', fontSize: 15, fontWeight: 600, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span>🔗</span> Cross-Source Validation Engine
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                            <div style={{ background: '#1e293b', borderRadius: 10, padding: 14 }}>
                                <div style={{ color: '#94a3b8', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Source 1</div>
                                <div style={{ color: '#3b82f6', fontSize: 14, fontWeight: 600, marginBottom: 4 }}>📊 POS Transaction Logs</div>
                                <div style={{ color: '#64748b', fontSize: 12 }}>
                                    Timestamps, amounts, void/refund events, discount patterns, drawer commands
                                </div>
                            </div>
                            <div style={{ background: '#1e293b', borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                                <div style={{ color: '#fbbf24', fontSize: 22, marginBottom: 4 }}>⚡</div>
                                <div style={{ color: '#fbbf24', fontSize: 12, fontWeight: 600 }}>Bidirectional Validation</div>
                                <div style={{ color: '#64748b', fontSize: 11, textAlign: 'center' }}>
                                    Each source validates the other
                                </div>
                            </div>
                            <div style={{ background: '#1e293b', borderRadius: 10, padding: 14 }}>
                                <div style={{ color: '#94a3b8', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Source 2</div>
                                <div style={{ color: '#10b981', fontSize: 14, fontWeight: 600, marginBottom: 4 }}>📹 Camera / Video Feed</div>
                                <div style={{ color: '#64748b', fontSize: 12 }}>
                                    Customer presence, hand movements, drawer state, gesture detection
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {loading && !scanning && (
                <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
                    Loading anomaly data...
                </div>
            )}
        </div>
    );
}
