import { useState, useEffect, useRef } from 'react';
import { clamp } from '../utils/timeUtils';
import './KPIHeader.css';

const KPIHeader = ({
    scenarioName, detectionState, isRunning,
    onToggleEngine, cameraEnabled, onToggleCamera
}) => {
    const [kpis, setKpis] = useState({ accuracy: 93.4, latency: 182, confidence: 91.2 });
    const intervalRef = useRef(null);
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    useEffect(() => {
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = setInterval(() => {
            if (!mountedRef.current) return;
            setKpis({
                accuracy: clamp(92 + Math.random() * 4, 90, 98),
                latency: Math.floor(140 + Math.random() * 100),
                confidence: clamp(88 + Math.random() * 8, 85, 98),
            });
        }, 5000);
        return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, []);

    const stateColor = detectionState === 'suspicious' ? '#e74c3c'
        : detectionState === 'review' ? '#f39c12' : '#2ecc71';

    return (
        <header className="kpi-header">
            <div className="kpi-left">
                <span className="kpi-brand">🛡️ SecureCounter AI</span>
                <span className="kpi-badge" style={{ color: stateColor, borderColor: stateColor + '30', background: stateColor + '10' }}>
                    {scenarioName}
                </span>
            </div>

            <div className="kpi-metrics">
                <div className="kpi-item">
                    <span className="kpi-val">{kpis.accuracy.toFixed(1)}%</span>
                    <span className="kpi-lbl">Accuracy</span>
                </div>
                <div className="kpi-sep" />
                <div className="kpi-item">
                    <span className="kpi-val">{kpis.latency}ms</span>
                    <span className="kpi-lbl">Latency</span>
                </div>
                <div className="kpi-sep" />
                <div className="kpi-item">
                    <span className="kpi-val">{kpis.confidence.toFixed(1)}%</span>
                    <span className="kpi-lbl">Confidence</span>
                </div>
            </div>

            <div className="kpi-controls">
                <button className={`kpi-btn ${cameraEnabled ? 'on' : ''}`} onClick={onToggleCamera}>
                    {cameraEnabled ? '📹 Camera ON' : '📷 Camera OFF'}
                </button>
                <button className={`kpi-btn ${isRunning ? 'on' : ''}`} onClick={onToggleEngine}>
                    {isRunning ? '▶ Auto' : '⏸ Paused'}
                </button>
            </div>
        </header>
    );
};

export default KPIHeader;
