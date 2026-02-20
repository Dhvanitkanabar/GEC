/**
 * Alert logic utilities for SecureCounter AI
 */

const DEBUG_MODE = true;

export const SEVERITY = {
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high',
    CRITICAL: 'critical',
};

export const ALERT_TYPES = {
    UNAUTHORIZED_DRAWER: 'Unauthorized Drawer Opening',
    HAND_TO_POCKET: 'Hand to Pocket Detected',
    CONCEALMENT: 'Concealment Motion Detected',
    TAMPERING: 'POS Tampering Detected',
    COUNTER_UNATTENDED: 'Counter Left Unattended',
    FORCED_OPEN: 'Drawer Forced Open',
    SYNC_MISMATCH: 'POS Sync Mismatch',
};

export const shouldTriggerAlert = (scenario) => {
    try {
        const { drawerOpen, posCommandFound, suspiciousAction, confidence } = scenario;
        if (drawerOpen && !posCommandFound && suspiciousAction && confidence > 80) {
            if (DEBUG_MODE) {
                console.log('[ALERT] Trigger conditions met:', scenario);
            }
            return { trigger: true, severity: SEVERITY.CRITICAL };
        }
        if (drawerOpen && !posCommandFound) {
            if (DEBUG_MODE) {
                console.log('[ALERT] Drawer open without POS command:', scenario);
            }
            return { trigger: true, severity: SEVERITY.HIGH };
        }
        if (suspiciousAction && confidence > 80) {
            return { trigger: true, severity: SEVERITY.MEDIUM };
        }
        return { trigger: false, severity: SEVERITY.LOW };
    } catch (err) {
        console.error('[ALERT] Error in alert logic:', err);
        return { trigger: false, severity: SEVERITY.LOW };
    }
};

export const createAlert = (type, confidence, severity) => {
    const safeConfidence = isNaN(confidence) ? 0 : Math.max(0, Math.min(100, confidence));
    return {
        id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type,
        confidence: safeConfidence,
        severity,
        timestamp: new Date(),
        status: 'active',
        reviewed: false,
    };
};

export const getRecommendedAction = (type) => {
    const actions = {
        [ALERT_TYPES.UNAUTHORIZED_DRAWER]: 'Review footage – No POS command found for this drawer opening.',
        [ALERT_TYPES.HAND_TO_POCKET]: 'Check cashier behavior – Possible concealment detected.',
        [ALERT_TYPES.CONCEALMENT]: 'Immediate review required – Concealment motion flagged.',
        [ALERT_TYPES.TAMPERING]: 'Alert supervisor – POS device tampering suspected.',
        [ALERT_TYPES.COUNTER_UNATTENDED]: 'Counter left unattended – Investigate immediately.',
        [ALERT_TYPES.FORCED_OPEN]: 'Drawer forced open without authorization.',
        [ALERT_TYPES.SYNC_MISMATCH]: 'POS log and video timestamps do not match.',
    };
    return actions[type] || 'Review footage and investigate.';
};
