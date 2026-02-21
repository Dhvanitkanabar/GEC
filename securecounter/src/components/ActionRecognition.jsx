import { useState, useEffect, useRef } from 'react';
import { clamp } from '../utils/timeUtils';
import './ActionRecognition.css';

const ActionRecognition = ({ scenario }) => {
    const [actions, setActions] = useState([]);
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    // Only update actions when scenario changes — no intervals
    useEffect(() => {
        if (!mountedRef.current) return;
        try {
            // Use exactly the 3 scenario actions — no extras
            const newActions = scenario.actions.map((a) => {
                const confidence = clamp(Math.floor(70 + Math.random() * 28), 0, 100);
                let status = 'safe';
                if (a.suspicious && confidence > 80) status = 'suspicious';
                else if (a.suspicious) status = 'review';
                return {
                    id: `${a.name}-${Date.now()}`,
                    name: a.name,
                    confidence,
                    status,
                };
            });
            setActions(newActions);
        } catch (err) {
            console.error('[ACTION] Error:', err);
        }
    }, [scenario]);

    return (
        <div className="action-panel">
            <div className="panel-head">
                <span className="head-title">🧠 AI Action Recognition</span>
            </div>
            <div className="action-list">
                {actions.map((action) => (
                    <div key={action.id} className={`action-item ${action.status}`}>
                        <div className="action-row">
                            <span className="action-name">{action.name}</span>
                            <span className={`action-badge ${action.status}`}>
                                {action.status === 'safe' ? '●' : action.status === 'review' ? '●' : '●'}{' '}
                                {action.status.toUpperCase()}
                            </span>
                        </div>
                        <div className="action-bar-bg">
                            <div
                                className={`action-bar-fill ${action.status}`}
                                style={{ width: `${clamp(action.confidence, 0, 100)}%` }}
                            />
                        </div>
                        <span className="action-pct">{action.confidence}%</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default ActionRecognition;
