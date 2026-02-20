import { useState, useEffect, useRef } from 'react';
import { formatTimestamp, isWithinTolerance } from '../utils/timeUtils';

const DEBUG_MODE = true;

const POS_EVENTS = ['Cash Sale', 'Shift End', 'Day End', 'Refund', 'Void Transaction'];

/**
 * POS Sync hook – simulates POS log events and compares with video events
 */
export const usePOSSync = (scenario) => {
    const [posEvent, setPosEvent] = useState({
        type: 'Cash Sale',
        timestamp: new Date(),
        drawerCommand: true,
    });
    const [videoEvent, setVideoEvent] = useState({
        drawerOpenTime: new Date(),
    });
    const [syncResult, setSyncResult] = useState({ matched: true, diffMs: 0 });
    const intervalRef = useRef(null);
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
        }

        intervalRef.current = setInterval(() => {
            if (!mountedRef.current) return;

            try {
                const now = new Date();
                const posTime = new Date(now.getTime() - Math.random() * 2000);
                const videoTime = scenario.drawerOpen
                    ? new Date(now.getTime() - 4000 - Math.random() * 3000)
                    : new Date(now.getTime() - Math.random() * 1500);

                const newPosEvent = {
                    type: POS_EVENTS[Math.floor(Math.random() * POS_EVENTS.length)],
                    timestamp: posTime,
                    drawerCommand: scenario.posCommandFound,
                };

                const newVideoEvent = { drawerOpenTime: videoTime };

                const matched = isWithinTolerance(posTime, videoTime, 3000);
                const diffMs = Math.abs(posTime.getTime() - videoTime.getTime());

                if (DEBUG_MODE) {
                    console.log(`[POS SYNC] POS: ${formatTimestamp(posTime)} | Video: ${formatTimestamp(videoTime)} | Diff: ${diffMs}ms | Match: ${matched}`);
                }

                setPosEvent(newPosEvent);
                setVideoEvent(newVideoEvent);
                setSyncResult({ matched: matched && scenario.posCommandFound, diffMs });
            } catch (err) {
                console.error('[POS SYNC] Error:', err);
            }
        }, 5000);

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, [scenario]);

    return { posEvent, videoEvent, syncResult };
};
