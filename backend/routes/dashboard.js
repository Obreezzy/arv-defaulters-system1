// backend/routes/dashboard.js
// Provides dashboard statistics and overview data

const express = require('express');
const { query } = require('../config/db');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(verifyToken);

// ============================================
// ROUTE 1: GET DASHBOARD OVERVIEW
// ============================================

// GET /api/dashboard/overview
// Purpose: Get comprehensive system overview
router.get('/overview', async (req, res) => {
    try {
        console.log('📊 Fetching dashboard overview');

        // Get all statistics in parallel
        const [
            patientStats,
            pickupStats,
            defaulterStats,
            upcomingPickups,
            recentActivity
        ] = await Promise.all([
            getPatientStatistics(),
            getPickupStatistics(),
            getDefaulterStatistics(),
            getUpcomingPickups(7),
            getRecentActivity(10)
        ]);

        // Calculate key metrics
        const adherenceRate = calculateAdherenceRate(
            patientStats.active_patients,
            defaulterStats.active_defaulters
        );

        res.json({
            success: true,
            message: 'Dashboard overview retrieved successfully',
            data: {
                summary: {
                    total_patients: patientStats.total_patients,
                    active_patients: patientStats.active_patients,
                    active_defaulters: defaulterStats.active_defaulters,
                    adherence_rate: adherenceRate,
                    upcoming_pickups_7days: upcomingPickups.length,
                    high_risk_defaulters: defaulterStats.high_risk
                },
                patients: patientStats,
                pickups: pickupStats,
                defaulters: defaulterStats,
                upcoming: upcomingPickups,
                recent_activity: recentActivity,
                alerts: generateAlerts(defaulterStats, upcomingPickups)
            }
        });

    } catch (error) {
        console.error('❌ Error fetching dashboard overview:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching dashboard overview',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ============================================
// ROUTE 2: GET PATIENT STATISTICS
// ============================================

// GET /api/dashboard/patients
// Purpose: Get detailed patient statistics
router.get('/patients', async (req, res) => {
    try {
        console.log('📊 Fetching patient statistics');

        const stats = await getPatientStatistics();

        res.json({
            success: true,
            message: 'Patient statistics retrieved successfully',
            stats: stats
        });

    } catch (error) {
        console.error('❌ Error fetching patient statistics:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching patient statistics',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ============================================
// ROUTE 3: GET DEFAULTER TRENDS
// ============================================

// GET /api/dashboard/defaulter-trends
// Purpose: Get defaulter trends over time
router.get('/defaulter-trends', async (req, res) => {
    try {
        const months = parseInt(req.query.months) || 6;

        console.log(`📈 Fetching defaulter trends (${months} months)`);

        const trends = await query(
            `SELECT 
                TO_CHAR(flagged_date, 'YYYY-MM') as month,
                COUNT(*) as total_defaulters,
                COUNT(*) FILTER (WHERE risk_level = 'high') as high_risk,
                COUNT(*) FILTER (WHERE risk_level = 'medium') as medium_risk,
                COUNT(*) FILTER (WHERE risk_level = 'low') as low_risk,
                COUNT(*) FILTER (WHERE status = 'returned') as returned,
                AVG(days_overdue) as avg_days_overdue
             FROM defaulters
             WHERE flagged_date >= CURRENT_DATE - INTERVAL '1 month' * $1
             GROUP BY TO_CHAR(flagged_date, 'YYYY-MM')
             ORDER BY month DESC`,
            [months]
        );

        res.json({
            success: true,
            message: 'Defaulter trends retrieved successfully',
            trends: trends.rows.map(row => ({
                ...row,
                avg_days_overdue: Math.round(parseFloat(row.avg_days_overdue) || 0)
            }))
        });

    } catch (error) {
        console.error('❌ Error fetching defaulter trends:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching defaulter trends',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ============================================
// ROUTE 4: GET URGENT ACTIONS
// ============================================

// GET /api/dashboard/urgent-actions
// Purpose: Get list of urgent actions needed
router.get('/urgent-actions', async (req, res) => {
    try {
        console.log('🚨 Fetching urgent actions');

        // High risk defaulters needing immediate follow-up
        const highRiskDefaulters = await query(
            `SELECT 
                d.defaulter_id, d.days_overdue,
                p.patient_id, p.patient_number, p.first_name, p.last_name,
                p.phone_number,
                COALESCE(
                    (SELECT COUNT(*) FROM followup_actions fa 
                     WHERE fa.defaulter_id = d.defaulter_id), 0
                ) as followup_count
             FROM defaulters d
             JOIN patients p ON d.patient_id = p.patient_id
             WHERE d.status = 'pending'
             AND d.risk_level = 'high'
             ORDER BY d.days_overdue DESC
             LIMIT 20`
        );

        // Patients with pickups today
        const pickupsToday = await query(
            `SELECT 
                p.patient_id, p.patient_number, p.first_name, p.last_name,
                p.phone_number, mp.next_pickup_date
             FROM patients p
             JOIN medication_pickups mp ON p.patient_id = mp.patient_id
             WHERE mp.next_pickup_date = CURRENT_DATE
             AND p.is_active = true
             AND NOT EXISTS (
                 SELECT 1 FROM medication_pickups mp2
                 WHERE mp2.patient_id = p.patient_id
                 AND mp2.actual_pickup_date = CURRENT_DATE
             )`
        );

        // Patients never picked up (registered but no pickups)
        const neverPickedUp = await query(
            `SELECT 
                p.patient_id, p.patient_number, p.first_name, p.last_name,
                p.phone_number, p.enrollment_date,
                CURRENT_DATE - p.enrollment_date as days_since_enrollment
             FROM patients p
             WHERE NOT EXISTS (
                 SELECT 1 FROM medication_pickups mp
                 WHERE mp.patient_id = p.patient_id
             )
             AND p.enrollment_date < CURRENT_DATE - 7
             AND p.is_active = true
             ORDER BY p.enrollment_date ASC
             LIMIT 10`
        );

        res.json({
            success: true,
            message: 'Urgent actions retrieved successfully',
            urgent_actions: {
                high_risk_defaulters: highRiskDefaulters.rows.map(row => ({
                    ...row,
                    action: 'Immediate follow-up required',
                    priority: 'critical'
                })),
                pickups_today: pickupsToday.rows.map(row => ({
                    ...row,
                    next_pickup_date_display: convertToDisplayDate(row.next_pickup_date),
                    action: 'Expected to collect medication today',
                    priority: 'high'
                })),
                never_picked_up: neverPickedUp.rows.map(row => ({
                    ...row,
                    enrollment_date_display: convertToDisplayDate(row.enrollment_date),
                    action: 'Patient enrolled but never collected medication',
                    priority: 'medium'
                }))
            },
            summary: {
                total_urgent: highRiskDefaulters.rows.length + 
                             pickupsToday.rows.length + 
                             neverPickedUp.rows.length,
                critical: highRiskDefaulters.rows.length,
                high: pickupsToday.rows.length,
                medium: neverPickedUp.rows.length
            }
        });

    } catch (error) {
        console.error('❌ Error fetching urgent actions:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching urgent actions',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ============================================
// HELPER FUNCTIONS
// ============================================

// Get patient statistics
const getPatientStatistics = async () => {
    const result = await query(`
        SELECT
            COUNT(*) as total_patients,
            COUNT(*) FILTER (WHERE is_active = true) as active_patients,
            COUNT(*) FILTER (WHERE is_active = false) as inactive_patients,
            COUNT(*) FILTER (WHERE gender = 'Male') as male_patients,
            COUNT(*) FILTER (WHERE gender = 'Female') as female_patients,
            COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '30 days') as new_this_month,
            COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') as new_this_week
        FROM patients
    `);
    return result.rows[0];
};

// Get pickup statistics
const getPickupStatistics = async () => {
    const result = await query(`
        SELECT
            COUNT(*) as total_pickups,
            COUNT(*) FILTER (WHERE actual_pickup_date >= CURRENT_DATE - INTERVAL '30 days') as pickups_this_month,
            COUNT(*) FILTER (WHERE actual_pickup_date >= CURRENT_DATE - INTERVAL '7 days') as pickups_this_week,
            COUNT(*) FILTER (WHERE actual_pickup_date = CURRENT_DATE) as pickups_today,
            AVG(days_supply) as avg_days_supply
        FROM medication_pickups
    `);
    return {
        ...result.rows[0],
        avg_days_supply: Math.round(parseFloat(result.rows[0].avg_days_supply) || 30)
    };
};

// Get defaulter statistics
const getDefaulterStatistics = async () => {
    const result = await query(`
        SELECT
            COUNT(*) FILTER (WHERE status = 'pending') as active_defaulters,
            COUNT(*) FILTER (WHERE status = 'returned') as returned,
            COUNT(*) FILTER (WHERE status = 'lost_to_followup') as lost_to_followup,
            COUNT(*) FILTER (WHERE risk_level = 'high') as high_risk,
            COUNT(*) FILTER (WHERE risk_level = 'medium') as medium_risk,
            COUNT(*) FILTER (WHERE risk_level = 'low') as low_risk,
            AVG(days_overdue) FILTER (WHERE status = 'pending') as avg_days_overdue
        FROM defaulters
    `);
    return {
        ...result.rows[0],
        avg_days_overdue: Math.round(parseFloat(result.rows[0].avg_days_overdue) || 0)
    };
};

// Get upcoming pickups
const getUpcomingPickups = async (days) => {
    const result = await query(
        `SELECT COUNT(*) as count
         FROM (
             SELECT DISTINCT ON (p.patient_id) p.patient_id
             FROM patients p
             JOIN medication_pickups mp ON p.patient_id = mp.patient_id
             WHERE mp.next_pickup_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '1 day' * $1
             AND p.is_active = true
             ORDER BY p.patient_id, mp.next_pickup_date DESC
         ) subquery`,
        [days]
    );
    return Array(parseInt(result.rows[0].count)).fill({});
};

// Get recent activity
const getRecentActivity = async (limit) => {
    const pickups = await query(
        `SELECT 
            'pickup' as type,
            mp.created_at,
            p.first_name || ' ' || p.last_name as patient_name,
            p.patient_number,
            'Medication collected' as description
         FROM medication_pickups mp
         JOIN patients p ON mp.patient_id = p.patient_id
         ORDER BY mp.created_at DESC
         LIMIT $1`,
        [limit]
    );
    return pickups.rows;
};

// Calculate adherence rate
const calculateAdherenceRate = (activePatients, activeDefaulters) => {
    if (activePatients === 0) return 0;
    const adherent = activePatients - activeDefaulters;
    return Math.round((adherent / activePatients) * 100);
};

// Generate alerts based on data
const generateAlerts = (defaulterStats, upcomingPickups) => {
    const alerts = [];

    if (defaulterStats.high_risk > 0) {
        alerts.push({
            type: 'critical',
            message: `${defaulterStats.high_risk} high-risk defaulters need immediate follow-up`,
            action: 'Review high-risk defaulters',
            link: '/defaulters?risk=high'
        });
    }

    if (defaulterStats.active_defaulters > 20) {
        alerts.push({
            type: 'warning',
            message: `Total defaulters (${defaulterStats.active_defaulters}) exceeds threshold`,
            action: 'Review defaulter management strategy',
            link: '/defaulters'
        });
    }

    if (upcomingPickups.length > 50) {
        alerts.push({
            type: 'info',
            message: `${upcomingPickups.length} patients have pickups scheduled in next 7 days`,
            action: 'Ensure adequate medication stock',
            link: '/pickups/upcoming'
        });
    }

    return alerts;
};

// Convert YYYY-MM-DD to DD-MM-YYYY
const convertToDisplayDate = (yyyymmdd) => {
    if (!yyyymmdd) return '';
    const date = new Date(yyyymmdd);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
};

module.exports = router;