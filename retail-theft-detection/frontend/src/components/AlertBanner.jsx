import React, { useEffect, useRef } from 'react';

export default function AlertBanner({ alert, onDismiss, onAcknowledge }) {
    const audioRef = useRef(null);

    // Play alert sound
    useEffect(() => {
        if (alert && (alert.severity === 'critical' || alert.severity === 'high')) {
            playAlertSound();
        }
    }, [alert]);

    const playAlertSound = () => {
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);

            oscillator.frequency.value = alert.severity === 'critical' ? 880 : 660;
            oscillator.type = 'sine';
            gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);

            oscillator.start(audioCtx.currentTime);
            oscillator.stop(audioCtx.currentTime + 0.5);

            // second beep
            setTimeout(() => {
                const osc2 = audioCtx.createOscillator();
                const gain2 = audioCtx.createGain();
                osc2.connect(gain2);
                gain2.connect(audioCtx.destination);
                osc2.frequency.value = alert.severity === 'critical' ? 1100 : 880;
                osc2.type = 'sine';
                gain2.gain.setValueAtTime(0.3, audioCtx.currentTime);
                gain2.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
                osc2.start(audioCtx.currentTime);
                osc2.stop(audioCtx.currentTime + 0.5);
            }, 200);
        } catch (e) {
            console.log('Audio not available');
        }
    };

    const severityConfig = {
        low: { bg: 'from-emerald-900/80 to-emerald-800/80', border: 'border-emerald-500/50', icon: '✅', label: 'Low Risk' },
        medium: { bg: 'from-amber-900/80 to-yellow-800/80', border: 'border-amber-500/50', icon: '⚠️', label: 'Suspicious' },
        high: { bg: 'from-orange-900/80 to-red-900/80', border: 'border-orange-500/50', icon: '🔶', label: 'High Risk' },
        critical: { bg: 'from-red-900/80 to-red-800/80', border: 'border-red-500/50', icon: '🚨', label: 'CRITICAL' },
    };

    const config = severityConfig[alert.severity] || severityConfig.medium;

    return (
        <div className={`fixed top-0 left-0 right-0 z-50 bg-gradient-to-r ${config.bg} backdrop-blur-xl border-b ${config.border} ${alert.severity === 'critical' ? 'alert-pulse' : ''}`}>
            <div className="max-w-[1600px] mx-auto px-6 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <span className="text-2xl">{config.icon}</span>
                    <div>
                        <p className="text-sm font-bold text-white">
                            {config.label}: {alert.title}
                        </p>
                        <p className="text-xs text-white/70">{alert.description}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {alert.risk_score > 0 && (
                        <span className="px-2 py-1 rounded text-xs font-mono font-bold bg-black/30 text-white">
                            Risk: {Math.round(alert.risk_score)}
                        </span>
                    )}
                    <button
                        onClick={onAcknowledge}
                        className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-medium text-white transition"
                    >
                        Acknowledge
                    </button>
                    <button
                        onClick={onDismiss}
                        className="px-2 py-1.5 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition"
                    >
                        ✕
                    </button>
                </div>
            </div>
        </div>
    );
}
