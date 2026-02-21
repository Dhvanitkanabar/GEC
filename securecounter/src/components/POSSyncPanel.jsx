import { formatTimestamp } from '../utils/timeUtils';
import './POSSyncPanel.css';

const POSSyncPanel = ({ posEvent, videoEvent, syncResult }) => {
    return (
        <div className="pos-panel">
            <div className="panel-head">
                <span className="head-icon">🧾</span>
                <span className="head-title">POS Log Sync Engine</span>
            </div>
            <div className="pos-content">
                <div className="pos-event-card">
                    <div className="event-row">
                        <span className="event-label">Latest POS Event</span>
                        <span className="event-value">{posEvent.type}</span>
                    </div>
                    <div className="event-row">
                        <span className="event-label">Drawer Command</span>
                        <span className={`event-value ${posEvent.drawerCommand ? 'green' : 'red'}`}>
                            {posEvent.drawerCommand ? '✅ Sent' : '❌ Not Found'}
                        </span>
                    </div>
                </div>

                <div className="sync-comparison">
                    <div className="sync-row">
                        <span className="sync-label">POS Drawer Open</span>
                        <span className="sync-time">{formatTimestamp(posEvent.timestamp)}</span>
                    </div>
                    <div className="sync-divider">
                        <span className="sync-vs">VS</span>
                    </div>
                    <div className="sync-row">
                        <span className="sync-label">Video Drawer Open</span>
                        <span className="sync-time">{formatTimestamp(videoEvent.drawerOpenTime)}</span>
                    </div>
                </div>

                <div className={`sync-result ${syncResult.matched ? 'matched' : 'mismatch'}`}>
                    <span className="sync-icon">{syncResult.matched ? '🟢' : '🔴'}</span>
                    <span className="sync-text">
                        {syncResult.matched ? 'Time Matched (±3s tolerance)' : 'Mismatch Detected'}
                    </span>
                    <span className="sync-diff">{syncResult.diffMs}ms diff</span>
                </div>

                {/* Mini Timeline */}
                <div className="timeline-visual">
                    <div className="timeline-bar">
                        <div className="timeline-track" />
                        <div
                            className="timeline-marker pos-marker"
                            style={{ left: `${Math.min(85, 20 + Math.random() * 30)}%` }}
                            title="POS Event"
                        >
                            <span className="marker-label">POS</span>
                        </div>
                        <div
                            className={`timeline-marker video-marker ${syncResult.matched ? '' : 'mismatch'}`}
                            style={{ left: `${Math.min(90, 50 + Math.random() * 30)}%` }}
                            title="Video Event"
                        >
                            <span className="marker-label">VID</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default POSSyncPanel;
