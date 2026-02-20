import { useState, useEffect, useRef, useCallback } from 'react';

const DEBUG_MODE = true;

const SCENARIOS = [
    {
        id: 'normal',
        name: 'Normal Sale',
        drawerOpen: false,
        posCommandFound: true,
        suspiciousAction: false,
        handDetected: false,
        drawerStatus: 'authorized',
        detectionState: 'safe',        // safe | review | suspicious
        severity: 'low',               // low | high | critical
        actions: [
            { name: 'Cash Handling', suspicious: false },
            { name: 'Receipt Issued', suspicious: false },
            { name: 'Drawer Closing', suspicious: false },
        ],
    },
    {
        id: 'drawer',
        name: 'Unauthorized Drawer Open',
        drawerOpen: true,
        posCommandFound: false,
        suspiciousAction: true,
        handDetected: true,
        drawerStatus: 'unauthorized',
        detectionState: 'review',
        severity: 'high',
        actions: [
            { name: 'Hand Near Drawer', suspicious: true },
            { name: 'Cash Handling', suspicious: false },
            { name: 'Counter Unattended', suspicious: true },
        ],
    },
    {
        id: 'concealment',
        name: 'Hand Concealment',
        drawerOpen: true,
        posCommandFound: false,
        suspiciousAction: true,
        handDetected: true,
        drawerStatus: 'unauthorized',
        detectionState: 'suspicious',
        severity: 'critical',
        actions: [
            { name: 'Hand to Pocket', suspicious: true },
            { name: 'Concealment Motion', suspicious: true },
            { name: 'Tampering Detected', suspicious: true },
        ],
    },
];

/**
 * Scenario engine hook – cycles through 3 scenarios every 10 seconds.
 * Exposes detectionState and handDetected for controlled detection logic.
 */
export const useScenarioEngine = () => {
    const [scenarioIndex, setScenarioIndex] = useState(0);
    const [scenario, setScenario] = useState(SCENARIOS[0]);
    const [isRunning, setIsRunning] = useState(true);
    const intervalRef = useRef(null);
    const mountedRef = useRef(true);

    const advanceScenario = useCallback(() => {
        setScenarioIndex((prev) => {
            const next = (prev + 1) % SCENARIOS.length;
            if (DEBUG_MODE) {
                console.log(`[SCENARIO] Transitioning to: ${SCENARIOS[next].name} (${SCENARIOS[next].detectionState})`);
            }
            return next;
        });
    }, []);

    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    useEffect(() => {
        if (mountedRef.current) {
            setScenario(SCENARIOS[scenarioIndex]);
        }
    }, [scenarioIndex]);

    useEffect(() => {
        if (intervalRef.current) clearInterval(intervalRef.current);
        if (isRunning) {
            intervalRef.current = setInterval(advanceScenario, 10000);
        }
        return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, [advanceScenario, isRunning]);

    const toggleEngine = useCallback(() => {
        setIsRunning((prev) => !prev);
    }, []);

    return {
        scenario,
        scenarioIndex,
        scenarioName: scenario.name,
        detectionState: scenario.detectionState,
        handDetected: scenario.handDetected,
        isRunning,
        toggleEngine,
    };
};
