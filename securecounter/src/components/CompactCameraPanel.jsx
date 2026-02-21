import { useRef, useEffect, useState, useCallback } from 'react';
import { formatTimestamp, clamp } from '../utils/timeUtils';
import './CompactCameraPanel.css';

const CAMERA_ERRORS = {
    NotAllowedError: 'Camera access required for live monitoring.',
    NotFoundError: 'No camera detected.',
    NotReadableError: 'Camera in use by another application.',
    default: 'Unable to access camera.',
};

const MOTION_THRESHOLD = 28;     // pixel intensity diff to count as motion
const MOTION_PIXEL_PCT = 0.025;  // % of pixels that must differ to trigger
const COOLDOWN_MS = 3000;        // auto-reset after 3 seconds

const CompactCameraPanel = ({ scenario }) => {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const streamRef = useRef(null);
    const rafRef = useRef(null);
    const mountedRef = useRef(true);
    const prevFrameRef = useRef(null);
    const cooldownRef = useRef(null);
    const fpsFrames = useRef(0);
    const fpsTime = useRef(performance.now());

    const [cameraStatus, setCameraStatus] = useState('connecting');
    const [errorMessage, setErrorMessage] = useState('');
    const [motionDetected, setMotionDetected] = useState(false);
    const [alertCount, setAlertCount] = useState(0);
    const [fps, setFps] = useState(0);
    const [timestamp, setTimestamp] = useState(formatTimestamp());
    const [latency, setLatency] = useState(0);

    const isAnomaly = motionDetected || scenario.drawerStatus === 'unauthorized';

    // ---- Start webcam ----
    useEffect(() => {
        mountedRef.current = true;
        let cancelled = false;

        const startCamera = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { width: { ideal: 640 }, height: { ideal: 480 } },
                    audio: false,
                });
                if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
                streamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    await videoRef.current.play();
                }
                if (mountedRef.current) setCameraStatus('connected');
            } catch (err) {
                if (mountedRef.current) {
                    setCameraStatus('error');
                    setErrorMessage(CAMERA_ERRORS[err.name] || CAMERA_ERRORS.default);
                }
            }
        };
        startCamera();

        return () => {
            cancelled = true;
            mountedRef.current = false;
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(t => t.stop());
                streamRef.current = null;
            }
            if (videoRef.current) videoRef.current.srcObject = null;
            if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
            if (cooldownRef.current) { clearTimeout(cooldownRef.current); cooldownRef.current = null; }
        };
    }, []);

    // ---- Trigger motion alert (with cooldown) ----
    const triggerMotion = useCallback(() => {
        if (!mountedRef.current) return;
        setMotionDetected(true);
        setAlertCount(prev => prev + 1);

        // Auto-reset after cooldown
        if (cooldownRef.current) clearTimeout(cooldownRef.current);
        cooldownRef.current = setTimeout(() => {
            if (mountedRef.current) setMotionDetected(false);
        }, COOLDOWN_MS);
    }, []);

    // ---- Frame processing loop ----
    const processFrame = useCallback(() => {
        if (!mountedRef.current) return;
        const t0 = performance.now();

        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!canvas || !video || video.readyState < 2) {
            rafRef.current = requestAnimationFrame(processFrame);
            return;
        }

        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const w = canvas.width = video.videoWidth || 640;
        const h = canvas.height = video.videoHeight || 480;

        // Draw current video frame to an offscreen buffer for pixel reading
        ctx.drawImage(video, 0, 0, w, h);
        const currentFrame = ctx.getImageData(0, 0, w, h);

        // ---- Motion detection via frame differencing ----
        if (prevFrameRef.current && !motionDetected) {
            try {
                const prev = prevFrameRef.current.data;
                const curr = currentFrame.data;
                const totalPixels = w * h;
                let movedPixels = 0;
                // Sample every 4th pixel for performance
                for (let i = 0; i < curr.length; i += 16) {
                    const dr = Math.abs(curr[i] - prev[i]);
                    const dg = Math.abs(curr[i + 1] - prev[i + 1]);
                    const db = Math.abs(curr[i + 2] - prev[i + 2]);
                    const diff = (dr + dg + db) / 3;
                    if (diff > MOTION_THRESHOLD) movedPixels++;
                }
                const sampledPixels = totalPixels / 4;
                if (movedPixels / sampledPixels > MOTION_PIXEL_PCT) {
                    triggerMotion();
                }
            } catch (_) { /* ignore frame comparison errors */ }
        }
        prevFrameRef.current = currentFrame;

        // ---- Clear canvas and draw overlays (don't keep video frame drawn) ----
        ctx.clearRect(0, 0, w, h);

        // Detection zone: Drawer
        const dx = w * 0.05, dy = h * 0.55, dw = w * 0.4, dh = h * 0.32;
        ctx.strokeStyle = scenario.drawerOpen ? '#ff4444' : '#44ff88';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 4]);
        ctx.strokeRect(dx, dy, dw, dh);
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(dx, dy - 16, 56, 14);
        ctx.fillStyle = scenario.drawerOpen ? '#ff6644' : '#44ff88';
        ctx.font = 'bold 9px "JetBrains Mono", monospace';
        ctx.fillText('DRAWER', dx + 4, dy - 5);

        // Detection zone: Hand
        const hx = w * 0.4 + Math.sin(Date.now() * 0.002) * 8;
        const hy = h * 0.25;
        const hw = w * 0.2, hh = h * 0.22;
        ctx.strokeStyle = motionDetected ? '#ff4444' : '#ffdd44';
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 3]);
        ctx.strokeRect(hx, hy, hw, hh);
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(hx, hy - 16, 44, 14);
        ctx.fillStyle = motionDetected ? '#ff4444' : '#ffdd44';
        ctx.font = 'bold 9px "JetBrains Mono", monospace';
        ctx.fillText('HAND', hx + 4, hy - 5);

        // Detection zone: POS
        const px = w * 0.68, py = h * 0.15, pw = w * 0.22, ph = h * 0.35;
        ctx.strokeStyle = '#00bfff';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(px, py, pw, ph);
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(px, py - 16, 36, 14);
        ctx.fillStyle = '#00bfff';
        ctx.font = 'bold 9px "JetBrains Mono", monospace';
        ctx.fillText('POS', px + 4, py - 5);

        // Corner brackets
        ctx.strokeStyle = 'rgba(0,191,255,0.5)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([]);
        const cl = 16;
        ctx.beginPath(); ctx.moveTo(4, 4 + cl); ctx.lineTo(4, 4); ctx.lineTo(4 + cl, 4); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(w - 4 - cl, 4); ctx.lineTo(w - 4, 4); ctx.lineTo(w - 4, 4 + cl); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(4, h - 4 - cl); ctx.lineTo(4, h - 4); ctx.lineTo(4 + cl, h - 4); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(w - 4 - cl, h - 4); ctx.lineTo(w - 4, h - 4); ctx.lineTo(w - 4, h - 4 - cl); ctx.stroke();

        // CAM ID
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(6, 6, 120, 16);
        ctx.fillStyle = '#00bfff';
        ctx.font = 'bold 9px "JetBrains Mono", monospace';
        ctx.fillText('CAM-01 | LIVE', 10, 17);

        // REC dot
        const blink = Math.floor(Date.now() / 500) % 2 === 0;
        if (blink) { ctx.fillStyle = '#ff0000'; ctx.beginPath(); ctx.arc(w - 16, 14, 4, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = '#fff';
        ctx.font = '8px "JetBrains Mono", monospace';
        ctx.fillText('REC', w - 38, 17);

        // Anomaly flash
        if (isAnomaly && blink) {
            ctx.fillStyle = 'rgba(255,0,0,0.06)';
            ctx.fillRect(0, 0, w, h);
        }

        // FPS calc
        fpsFrames.current++;
        const now = performance.now();
        if (now - fpsTime.current >= 1000) {
            if (mountedRef.current) setFps(fpsFrames.current);
            fpsFrames.current = 0;
            fpsTime.current = now;
        }

        if (mountedRef.current) {
            setTimestamp(formatTimestamp());
            setLatency(clamp(Math.round(performance.now() - t0), 0, 999));
        }

        rafRef.current = requestAnimationFrame(processFrame);
    }, [scenario, motionDetected, isAnomaly, triggerMotion]);

    // Start processing loop when connected
    useEffect(() => {
        if (cameraStatus !== 'connected') return;
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(processFrame);
        return () => { if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; } };
    }, [cameraStatus, processFrame]);

    // ---- Render ----
    return (
        <div className={`compact-cam ${isAnomaly ? 'anomaly' : ''}`}>
            {/* Header */}
            <div className="cc-header">
                <div className="cc-title">
                    <span className="cc-icon">📹</span> Live Surveillance
                </div>
                <div className="cc-badges">
                    {motionDetected && (
                        <span className="cc-alert-badge pulse">
                            ⚠ Hand Detected
                        </span>
                    )}
                    {alertCount > 0 && (
                        <span className="cc-count-badge">{alertCount}</span>
                    )}
                </div>
            </div>

            {/* Camera area */}
            <div className="cc-feed">
                <video
                    ref={videoRef}
                    autoPlay
                    muted
                    playsInline
                    className={`cc-video ${cameraStatus !== 'connected' ? 'hidden' : ''}`}
                />
                <canvas ref={canvasRef} className="cc-overlay" />

                {/* Anomaly overlay text */}
                {isAnomaly && cameraStatus === 'connected' && (
                    <div className="cc-anomaly-text">
                        <span>⚠ {motionDetected ? 'Hand Detected' : 'Suspicious Activity Detected'}</span>
                    </div>
                )}

                {/* Error */}
                {cameraStatus === 'error' && (
                    <div className="cc-error">
                        <span className="cc-err-icon">📷</span>
                        <span className="cc-err-msg">{errorMessage}</span>
                    </div>
                )}

                {/* Connecting */}
                {cameraStatus === 'connecting' && (
                    <div className="cc-connecting">
                        <div className="cc-spinner" />
                        <span>Initializing…</span>
                    </div>
                )}

                {/* Status overlay (top-right) */}
                {cameraStatus === 'connected' && (
                    <div className="cc-status-overlay">
                        <div className="cc-stat">
                            <span className={`cc-dot ${motionDetected ? 'red' : 'green'}`} />
                            <span>{motionDetected ? 'ALERT' : 'Monitoring'}</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Footer bar */}
            <div className="cc-footer">
                <span className="cc-ts">{timestamp}</span>
                <span className="cc-lat">{latency}ms</span>
                <span className="cc-fps">{fps} FPS</span>
                <span className={`cc-cam-status ${cameraStatus}`}>
                    {cameraStatus === 'connected' ? '● LIVE' : cameraStatus === 'error' ? '● OFF' : '● …'}
                </span>
            </div>
        </div>
    );
};

export default CompactCameraPanel;
