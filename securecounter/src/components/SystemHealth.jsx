import { useState, useEffect, useRef } from 'react';
import { randomInRange } from '../utils/timeUtils';
import './SystemHealth.css';

const SystemHealth = () => {
    const [health, setHealth] = useState({
        camera: 'connected',
        posFeed: 'active',
        aiModel: 'running',
        dbStatus: 'connected',
        latency: 182,
        frameDrops: 0,
        warning: null,
    });
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
            try {
                const latency = randomInRange(120, 280);
                const frameDrops = randomInRange(0, 3);
                const warnings = [
                    null, null, null, null, null, null, null,
                    '⚠ Video Feed Interrupted',
                    '⚠ POS Log Not Updating',
                    '⚠ AI Model Confidence Low',
                ];
                const warning = warnings[Math.floor(Math.random() * warnings.length)];

                setHealth({
                    camera: Math.random() > 0.05 ? 'connected' : 'reconnecting',
                    posFeed: Math.random() > 0.08 ? 'active' : 'delayed',
                    aiModel: Math.random() > 0.03 ? 'running' : 'loading',
                    dbStatus: 'connected',
                    latency,
                    frameDrops,
                    warning,
                });
            } catch (err) {
                console.error('[HEALTH] Error:', err);
            }
        }, 4000);

        return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, []);

    const statusDot = (status) => {
        const isGood = ['connected', 'active', 'running'].includes(status);
        return <span className={`status-dot ${isGood ? 'green' : 'yellow'}`} />;
    };

    return (
        <div className="health-panel glass-panel">
            <div className="panel-head">
                <span className="head-icon">⚙</span>
                <span className="head-title">System Health</span>
            </div>
            <div className="health-grid">
                <div className="health-item">
                    {statusDot(health.camera)}
                    <span className="health-label">Camera</span>
                    <span className="health-value">{health.camera}</span>
                </div>
                <div className="health-item">
                    {statusDot(health.posFeed)}
                    <span className="health-label">POS Feed</span>
                    <span className="health-value">{health.posFeed}</span>
                </div>
                <div className="health-item">
                    {statusDot(health.aiModel)}
                    <span className="health-label">AI Model</span>
                    <span className="health-value">{health.aiModel}</span>
                </div>
                <div className="health-item">
                    {statusDot(health.dbStatus)}
                    <span className="health-label">Database</span>
                    <span className="health-value">{health.dbStatus}</span>
                </div>
                <div className="health-item metric">
                    <span className="health-label">Latency</span>
                    <span className={`health-value mono ${health.latency > 250 ? 'red' : 'blue'}`}>
                        {health.latency}ms
                    </span>
                </div>
                <div className="health-item metric">
                    <span className="health-label">Frame Drops</span>
                    <span className={`health-value mono ${health.frameDrops > 1 ? 'yellow-text' : 'green-text'}`}>
                        {health.frameDrops}
                    </span>
                </div>
            </div>
            {health.warning && (
                <div className="health-warning">
                    {health.warning}
                </div>
            )}
        </div>
    );
};

export default SystemHealth;
