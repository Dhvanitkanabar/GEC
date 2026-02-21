import { formatTimestamp } from '../utils/timeUtils';
import { getRecommendedAction } from '../utils/alertLogic';
import './AlertsPanel.css';

const AlertsPanel = ({ alerts, onUpdateAlert, onClearAlerts }) => {
    const getSeverityClass = (severity) => {
        const map = { critical: 'critical', high: 'high', medium: 'medium', low: 'low' };
        return map[severity] || 'low';
    };

    const handleAction = (alertId, action) => {
        try {
            onUpdateAlert(alertId, action);
        } catch (err) {
            console.error('[ALERTS] Error updating alert:', err);
        }
    };

    return (
        <div className="alerts-panel">
            <div className="panel-head">
                <span className="head-icon">🚨</span>
                <span className="head-title">Security Alert System</span>
                <span className="alert-count">{alerts.filter(a => a.status === 'active').length} Active</span>
                {alerts.length > 0 && onClearAlerts && (
                    <button className="alert-clear-btn" onClick={onClearAlerts}>Clear All</button>
                )}
            </div>
            <div className="alerts-container">
                {alerts.length === 0 ? (
                    <div className="no-alerts">
                        <span className="no-alerts-icon">🛡️</span>
                        <span>All Clear — No Active Alerts</span>
                    </div>
                ) : (
                    alerts.map((alert) => (
                        <div
                            key={alert.id}
                            className={`alert-card ${getSeverityClass(alert.severity)} ${alert.status}`}
                        >
                            <div className="alert-header">
                                <div className="alert-severity-badge">
                                    {alert.severity === 'critical' && '⛔'}
                                    {alert.severity === 'high' && '🔴'}
                                    {alert.severity === 'medium' && '🟠'}
                                    {alert.severity === 'low' && '🟡'}
                                    <span>{alert.severity.toUpperCase()}</span>
                                </div>
                                <span className="alert-time">{formatTimestamp(alert.timestamp)}</span>
                            </div>
                            <div className="alert-body">
                                <div className="alert-type">{alert.type}</div>
                                <div className="alert-confidence">
                                    Confidence: <strong>{alert.confidence}%</strong>
                                </div>
                                <div className="alert-recommendation">
                                    {getRecommendedAction(alert.type)}
                                </div>
                            </div>
                            {alert.status === 'active' && (
                                <div className="alert-actions">
                                    <button
                                        className="alert-btn review"
                                        onClick={() => handleAction(alert.id, 'reviewed')}
                                    >
                                        Review Clip
                                    </button>
                                    <button
                                        className="alert-btn false-alert"
                                        onClick={() => handleAction(alert.id, 'false_alert')}
                                    >
                                        Mark False
                                    </button>
                                    <button
                                        className="alert-btn confirm"
                                        onClick={() => handleAction(alert.id, 'confirmed')}
                                    >
                                        Confirm Theft
                                    </button>
                                    <button
                                        className="alert-btn escalate"
                                        onClick={() => handleAction(alert.id, 'escalated')}
                                    >
                                        Escalate
                                    </button>
                                </div>
                            )}
                            {alert.status !== 'active' && (
                                <div className="alert-resolved">
                                    ✅ {alert.status.replace('_', ' ').toUpperCase()}
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default AlertsPanel;
