import { useRef, useCallback, useEffect, useState } from 'react';

/**
 * Custom hook to track FPS using requestAnimationFrame
 */
export const useFPS = () => {
    const [fps, setFps] = useState(0);
    const frameCount = useRef(0);
    const lastTime = useRef(performance.now());
    const rafId = useRef(null);

    const tick = useCallback(() => {
        frameCount.current += 1;
        const now = performance.now();
        const elapsed = now - lastTime.current;

        if (elapsed >= 1000) {
            setFps(Math.round((frameCount.current * 1000) / elapsed));
            frameCount.current = 0;
            lastTime.current = now;
        }

        rafId.current = requestAnimationFrame(tick);
    }, []);

    useEffect(() => {
        rafId.current = requestAnimationFrame(tick);
        return () => {
            if (rafId.current) {
                cancelAnimationFrame(rafId.current);
            }
        };
    }, [tick]);

    return fps;
};
