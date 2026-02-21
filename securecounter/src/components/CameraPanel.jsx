import { useRef, useEffect, useCallback, useState } from 'react';
import { formatTimestamp } from '../utils/timeUtils';
import './CameraPanel.css';

const ERR_MSGS = {
    NotAllowedError: 'Camera access required for live monitoring.',
    NotFoundError: 'No camera detected on this device.',
    NotReadableError: 'Camera is in use by another application.',
    default: 'Unable to access camera.',
};

const CameraPanel = ({ scenario, detectionState, handDetected }) => {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const streamRef = useRef(null);
    const rafRef = useRef(null);
    const mountedRef = useRef(true);
    const frameCount = useRef(0);
    const fpsFrames = useRef(0);
    const fpsTime = useRef(performance.now());

    const [status, setStatus] = useState('connecting'); // connecting | live | error
    const [error, setError] = useState('');
    const [fps, setFps] = useState(0);
    const [ts, setTs] = useState(formatTimestamp());

    // ---- Start camera ----
    useEffect(() => {
        mountedRef.current = true;
        let cancelled = false;

        const init = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
                    audio: false,
                });
                if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
                streamRef.current = stream;

                const video = videoRef.current;
                if (video) {
                    video.srcObject = stream;
                    // Wait for metadata before playing
                    video.onloadedmetadata = () => {
                        video.play().then(() => {
                            if (mountedRef.current) setStatus('live');
                        }).catch(() => { });
                    };
                }
            } catch (err) {
                if (mountedRef.current) {
                    setStatus('error');
                    setError(ERR_MSGS[err.name] || ERR_MSGS.default);
                }
            }
        };
        init();

        return () => {
            cancelled = true;
            mountedRef.current = false;
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(t => t.stop());
                streamRef.current = null;
            }
            if (videoRef.current) videoRef.current.srcObject = null;
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, []);

    // ---- Overlay drawing ----
    const draw = useCallback(() => {
        if (!mountedRef.current) return;

        const canvas = canvasRef.current;
        const video = videoRef.current;
        if (!canvas || !video || video.readyState < 2) {
            rafRef.current = requestAnimationFrame(draw);
            return;
        }

        const rect = canvas.parentElement.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);
        frameCount.current++;

        // ---- Bounding boxes driven by scenario state ----

        // Drawer zone
        ctx.strokeStyle = scenario.drawerOpen ? '#e74c3c' : '#2ecc71';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 4]);
        ctx.strokeRect(w * 0.04, h * 0.52, w * 0.36, h * 0.34);
        ctx.setLineDash([]);
        ctx.font = '600 9px "JetBrains Mono", monospace';
        ctx.fillStyle = scenario.drawerOpen ? '#e74c3c' : '#2ecc71';
        ctx.fillText('DRAWER', w * 0.06, h * 0.50);

        // Hand zone – only when hand detected
        if (handDetected) {
            ctx.strokeStyle = detectionState === 'suspicious' ? '#e74c3c' : '#f39c12';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([3, 3]);
            const hx = w * 0.42 + Math.sin(frameCount.current * 0.04) * 4;
            ctx.strokeRect(hx, h * 0.2, w * 0.22, h * 0.28);
            ctx.setLineDash([]);
            ctx.fillStyle = detectionState === 'suspicious' ? '#e74c3c' : '#f39c12';
            ctx.fillText('HAND', hx + 4, h * 0.18);
        }

        // POS zone
        ctx.strokeStyle = '#3498db';
        ctx.lineWidth = 1;
        ctx.strokeRect(w * 0.68, h * 0.14, w * 0.22, h * 0.30);
        ctx.fillStyle = '#3498db';
        ctx.fillText('POS', w * 0.70, h * 0.12);

        // CAM label
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(4, 4, 90, 15);
        ctx.fillStyle = '#3498db';
        ctx.font = 'bold 9px "JetBrains Mono", monospace';
        ctx.fillText('CAM-01 • LIVE', 8, 14);

        // REC indicator
        if (frameCount.current % 60 < 40) {
            ctx.fillStyle = '#e74c3c';
            ctx.beginPath();
            ctx.arc(w - 14, 12, 3.5, 0, Math.PI * 2);
            ctx.fill();
        }

        // Anomaly tint
        if ((detectionState === 'suspicious' || detectionState === 'review') && frameCount.current % 40 < 20) {
            ctx.fillStyle = 'rgba(231, 76, 60, 0.04)';
            ctx.fillRect(0, 0, w, h);
        }

        // FPS counter
        fpsFrames.current++;
        const now = performance.now();
        if (now - fpsTime.current >= 1000) {
            if (mountedRef.current) setFps(fpsFrames.current);
            fpsFrames.current = 0;
            fpsTime.current = now;
        }
        if (mountedRef.current) setTs(formatTimestamp());

        rafRef.current = requestAnimationFrame(draw);
    }, [scenario, detectionState, handDetected]);

    // Start/stop drawing loop
    useEffect(() => {
        if (status !== 'live') return;
        rafRef.current = requestAnimationFrame(draw);
        return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    }, [status, draw]);

    const stateColor = detectionState === 'suspicious' ? '#e74c3c'
        : detectionState === 'review' ? '#f39c12' : '#2ecc71';

    return (
        <div className={`cam-panel ${detectionState !== 'safe' ? 'alert-border' : ''}`}>
            {/* Header */}
            <div className="cam-header">
                <span className="cam-title">Live Camera Feed</span>
                <div className="cam-badges">
                    <span className="cam-state" style={{ color: stateColor }}>
                        <span className="cam-dot" style={{ background: stateColor }} />
                        {detectionState === 'suspicious' ? 'SUSPICIOUS' : detectionState === 'review' ? 'REVIEW' : 'SAFE'}
                    </span>
                    <span className="cam-fps">{fps} FPS</span>
                </div>
            </div>

            {/* Video + Canvas container */}
            <div className="cam-viewport">
                {/* Video element – always rendered, visible when live */}
                <video
                    ref={videoRef}
                    autoPlay
                    muted
                    playsInline
                    className="cam-video"
                    style={{ display: status === 'live' ? 'block' : 'none' }}
                />
                {/* Canvas overlay – transparent, on top of video */}
                <canvas ref={canvasRef} className="cam-canvas" />

                {/* Detection overlay text */}
                {status === 'live' && handDetected && (
                    <div className="cam-alert-overlay">
                        ⚠ Hand Detected
                    </div>
                )}

                {/* Error state */}
                {status === 'error' && (
                    <div className="cam-message">
                        <span className="cam-msg-icon">📷</span>
                        <span className="cam-msg-title">Camera Unavailable</span>
                        <span className="cam-msg-text">{error}</span>
                    </div>
                )}

                {/* Connecting state */}
                {status === 'connecting' && (
                    <div className="cam-message">
                        <div className="cam-spinner" />
                        <span className="cam-msg-text">Connecting to camera…</span>
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="cam-footer">
                <span className="cam-ts">{ts}</span>
                <span className="cam-scenario">{scenario.name}</span>
            </div>
        </div>
    );
};

export default CameraPanel;
