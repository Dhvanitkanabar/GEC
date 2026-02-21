import { useEffect, useRef } from 'react';

export const useAudioAlert = (active: boolean) => {
    const audioContext = useRef<AudioContext | null>(null);
    const oscillator = useRef<OscillatorNode | null>(null);
    const gainNode = useRef<GainNode | null>(null);

    useEffect(() => {
        if (active) {
            if (!audioContext.current) {
                audioContext.current = new (window.AudioContext || (window as any).webkitAudioContext)();
            }

            const ctx = audioContext.current;

            // Pulsing beep sound (1000Hz)
            oscillator.current = ctx.createOscillator();
            gainNode.current = ctx.createGain();

            oscillator.current.type = 'square'; // Sharper digital feel
            oscillator.current.frequency.setValueAtTime(1000, ctx.currentTime);

            // Beep effect: rhythmic toggle of gain
            const pulseInterval = setInterval(() => {
                if (gainNode.current) {
                    const now = ctx.currentTime;
                    gainNode.current.gain.cancelScheduledValues(now);
                    gainNode.current.gain.setValueAtTime(0, now);
                    gainNode.current.gain.linearRampToValueAtTime(0.15, now + 0.05);
                    gainNode.current.gain.linearRampToValueAtTime(0, now + 0.15);
                }
            }, 300);

            oscillator.current.connect(gainNode.current);
            gainNode.current.connect(ctx.destination);

            oscillator.current.start();

            return () => {
                clearInterval(pulseInterval);
                if (oscillator.current) {
                    oscillator.current.stop();
                    oscillator.current.disconnect();
                    oscillator.current = null;
                }
                if (gainNode.current) {
                    gainNode.current.disconnect();
                    gainNode.current = null;
                }
            };
        }
    }, [active]);
};
