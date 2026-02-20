/**
 * Risk Scoring Engine
 * Combines software (POS) and physical (camera) anomaly signals
 * into a unified risk score per cashier per shift.
 */

// Weight constants for software anomalies
const SW_WEIGHTS = {
    price_edit: 15,       // Editing price after creation
    void_transaction: 20, // Voiding a completed transaction
    refund: 10,           // Issuing a refund
    backdate: 30,         // Attempting to backdate
    delete_attempt: 50,   // Any deletion attempt (blocked but logged)
    unusual_discount: 12, // Discount > 30%
    rapid_voids: 25,      // Multiple voids in short time
    off_hours_activity: 18 // Activity outside shift hours
};

// Weight constants for physical anomalies
const PH_WEIGHTS = {
    hand_to_pocket: 35,
    hand_hovering_drawer: 15,
    drawer_opened_no_pos: 40,
    drawer_forced_open: 45,
    suspicious_gesture: 20,
    repeated_drawer_access: 25
};

// Severity thresholds
const SEVERITY = {
    LOW: { min: 0, max: 20, label: 'low', color: 'green' },
    MEDIUM: { min: 21, max: 50, label: 'medium', color: 'yellow' },
    HIGH: { min: 51, max: 80, label: 'high', color: 'orange' },
    CRITICAL: { min: 81, max: 100, label: 'critical', color: 'red' }
};

class RiskEngine {
    /**
     * Calculate software risk score from POS anomalies
     * @param {Array} events - Array of anomaly events
     * @returns {number} Score 0-100
     */
    static calculateSoftwareScore(events) {
        let score = 0;
        for (const event of events) {
            const weight = SW_WEIGHTS[event.type] || 5;
            score += weight * (event.confidence || 1);
        }
        return Math.min(100, score);
    }

    /**
     * Calculate physical risk score from camera events
     * @param {Array} events - Array of camera events
     * @returns {number} Score 0-100
     */
    static calculatePhysicalScore(events) {
        let score = 0;
        for (const event of events) {
            const weight = PH_WEIGHTS[event.event_type] || 10;
            score += weight * (event.confidence || 0.5);
        }
        return Math.min(100, score);
    }

    /**
     * Combined risk score (weighted average)
     * @param {number} swScore - Software score
     * @param {number} phScore - Physical score
     * @returns {number} Combined score 0-100
     */
    static combinedScore(swScore, phScore) {
        // If both present, weight physical slightly higher (it's more actionable)
        if (swScore > 0 && phScore > 0) {
            return Math.min(100, Math.round(swScore * 0.45 + phScore * 0.55));
        }
        return Math.max(swScore, phScore);
    }

    /**
     * Get severity level from score
     * @param {number} score - Risk score 0-100
     * @returns {Object} { label, color }
     */
    static getSeverity(score) {
        if (score <= SEVERITY.LOW.max) return SEVERITY.LOW;
        if (score <= SEVERITY.MEDIUM.max) return SEVERITY.MEDIUM;
        if (score <= SEVERITY.HIGH.max) return SEVERITY.HIGH;
        return SEVERITY.CRITICAL;
    }

    /**
     * Evaluate a cashier's overall risk profile
     * @param {Object} db - Database instance
     * @param {string} cashierId - User ID
     * @param {string} periodHours - Lookback period in hours
     * @returns {Object} Risk assessment
     */
    static evaluateCashier(db, cashierId, periodHours = 8) {
        const since = new Date(Date.now() - periodHours * 3600000).toISOString();

        // Get POS anomalies
        const posLogs = db.prepare(`
      SELECT action, details, timestamp FROM transaction_log
      WHERE performed_by = ? AND timestamp >= ?
      AND action IN ('price_edited', 'voided', 'refunded')
    `).all(cashierId, since);

        const swEvents = posLogs.map(log => ({
            type: log.action === 'price_edited' ? 'price_edit' :
                log.action === 'voided' ? 'void_transaction' : 'refund',
            confidence: 1
        }));

        // Get camera anomalies
        const camEvents = db.prepare(`
      SELECT event_type, confidence, risk_score FROM camera_events
      WHERE cashier_id = ? AND timestamp >= ?
      AND event_type != 'normal'
    `).all(cashierId, since);

        const swScore = this.calculateSoftwareScore(swEvents);
        const phScore = this.calculatePhysicalScore(camEvents);
        const combined = this.combinedScore(swScore, phScore);
        const severity = this.getSeverity(combined);

        return {
            cashier_id: cashierId,
            software_score: swScore,
            physical_score: phScore,
            combined_score: combined,
            severity,
            sw_event_count: swEvents.length,
            ph_event_count: camEvents.length,
            period_hours: periodHours
        };
    }
}

module.exports = { RiskEngine, SW_WEIGHTS, PH_WEIGHTS, SEVERITY };
