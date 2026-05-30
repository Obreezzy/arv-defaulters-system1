/**
 * backend/routes/dashboard.js
 * Rewritten for new arv_inference schema.
 */

const express = require('express');
const { query } = require('../config/db');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();
router.use(verifyToken);

// ─────────────────────────────────────────────────────────────────
// GET /api/dashboard/overview
// ─────────────────────────────────────────────────────────────────
router.get('/overview', async (req, res) => {
    try {
        const [patientStats, defaulterStats, riskStats, upcomingPickups] = await Promise.all([
            getPatientStatistics(),
            getDefaulterStatistics(),
            getRiskStatistics(),
            getUpcomingPickups(7),
        ]);

        const adherenceRate = calculateAdherenceRate(
            patientStats.active_patients,
            defaulterStats.active_defaulters
        );

        res.json({
            success: true,
            data: {
                summary: {
                    total_patients:          patientStats.total_patients,
                    active_patients:         patientStats.active_patients,
                    active_defaulters:       defaulterStats.active_defaulters,
                    adherence_rate:          adherenceRate,
                    upcoming_pickups_7days:  upcomingPickups,
                    high_risk_total:         riskStats.high_risk,
                    medium_risk_total:       riskStats.medium_risk,
                },
                patients:  patientStats,
                defaulters: defaulterStats,
                risk:      riskStats,
                alerts:    generateAlerts(defaulterStats, riskStats),
            }
        });
    } catch (err) {
        console.error('Dashboard error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/dashboard/patients
// ─────────────────────────────────────────────────────────────────
router.get('/patients', async (req, res) => {
    try {
        const stats = await getPatientStatistics();
        res.json({ success: true, stats });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/dashboard/defaulter-trends
// ─────────────────────────────────────────────────────────────────
router.get('/defaulter-trends', async (req, res) => {
    try {
        const months = parseInt(req.query.months) || 6;
        const trends = await query(`
            SELECT
                TO_CHAR(detected_date, 'YYYY-MM') as month,
                COUNT(*) as total_defaulters,
                COUNT(*) FILTER (WHERE risk_level ILIKE 'high')   as high_risk,
                COUNT(*) FILTER (WHERE risk_level ILIKE 'medium') as medium_risk,
                COUNT(*) FILTER (WHERE risk_level ILIKE 'low')    as low_risk,
                AVG(days_overdue) as avg_days_overdue
            FROM defaulters
            WHERE detected_date >= CURRENT_DATE - ($1 || ' months')::INTERVAL
            GROUP BY TO_CHAR(detected_date, 'YYYY-MM')
            ORDER BY month DESC
        `, [months]);

        res.json({ success: true, trends: trends.rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/dashboard/urgent-actions
// ─────────────────────────────────────────────────────────────────
router.get('/urgent-actions', async (req, res) => {
    try {
        const highRisk = await query(`
            SELECT d.defaulter_id, d.days_overdue, d.risk_level,
                   p.patient_id, p.phone_available, p.residence_district,
                   f.facility_name
            FROM defaulters d
            JOIN patients p  ON d.patient_id  = p.patient_id
            JOIN facilities f ON p.facility_id = f.facility_id
            WHERE d.status = 'pending' AND d.risk_level ILIKE 'high'
            ORDER BY d.days_overdue DESC
            LIMIT 20
        `);

        res.json({
            success: true,
            urgent_actions: { high_risk_defaulters: highRisk.rows }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────
const getPatientStatistics = async () => {
    const result = await query(`
        SELECT
            COUNT(*)                                          AS total_patients,
            COUNT(*) FILTER (WHERE exit_status = 'active')   AS active_patients,
            COUNT(*) FILTER (WHERE sex = 'M')                AS male_patients,
            COUNT(*) FILTER (WHERE sex = 'F')                AS female_patients
        FROM patients
    `);
    return result.rows[0];
};

const getDefaulterStatistics = async () => {
    const result = await query(`
        SELECT
            COUNT(*) FILTER (WHERE status = 'pending')             AS active_defaulters,
            COUNT(*) FILTER (WHERE risk_level ILIKE 'high')        AS high_risk,
            COUNT(*) FILTER (WHERE risk_level ILIKE 'medium')      AS medium_risk,
            COUNT(*) FILTER (WHERE risk_level ILIKE 'low')         AS low_risk,
            AVG(days_overdue) FILTER (WHERE status = 'pending')    AS avg_days_overdue
        FROM defaulters
    `);
    return {
        ...result.rows[0],
        avg_days_overdue: Math.round(parseFloat(result.rows[0].avg_days_overdue) || 0),
    };
};

const getRiskStatistics = async () => {
    const result = await query(`
        SELECT
            COUNT(*) FILTER (WHERE risk_tier = 'high')   AS high_risk,
            COUNT(*) FILTER (WHERE risk_tier = 'medium') AS medium_risk,
            COUNT(*) FILTER (WHERE risk_tier = 'low')    AS low_risk,
            AVG(default_probability)                      AS avg_probability
        FROM (
            SELECT DISTINCT ON (patient_id) patient_id, risk_tier, default_probability
            FROM risk_scores
            ORDER BY patient_id, scored_at DESC
        ) latest
    `);
    return {
        ...result.rows[0],
        avg_probability: Math.round((parseFloat(result.rows[0].avg_probability) || 0) * 100),
    };
};

const getUpcomingPickups = async (days) => {
    const result = await query(`
        SELECT COUNT(*) AS count
        FROM (
            SELECT DISTINCT ON (patient_id) patient_id
            FROM visits
            WHERE scheduled_next_appt_date BETWEEN CURRENT_DATE AND CURRENT_DATE + ($1 || ' days')::INTERVAL
            ORDER BY patient_id, visit_date DESC
        ) sub
    `, [days]);
    return parseInt(result.rows[0].count) || 0;
};

const calculateAdherenceRate = (activePatients, activeDefaulters) => {
    const total = parseInt(activePatients) || 0;
    const defaulting = parseInt(activeDefaulters) || 0;
    if (total === 0) return 0;
    return Math.round(((total - defaulting) / total) * 100);
};

const generateAlerts = (defaulterStats, riskStats) => {
    const alerts = [];
    if (parseInt(defaulterStats.high_risk) > 0) {
        alerts.push({
            type: 'critical',
            message: `${defaulterStats.high_risk} high-risk defaulters need immediate follow-up`,
            link: '/defaulters?risk=high',
        });
    }
    if (parseInt(riskStats.high_risk) > 0) {
        alerts.push({
            type: 'warning',
            message: `${riskStats.high_risk} active patients predicted as high default risk`,
            link: '/patients?risk=High',
        });
    }
    return alerts;
};

module.exports = router;