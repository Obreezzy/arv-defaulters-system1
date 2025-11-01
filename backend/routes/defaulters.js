// backend/routes/defaulters.js
// Handles defaulter detection, tracking, and follow-up

const express = require('express');
const { query, getClient } = require('../config/db');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(verifyToken);

// ============================================
// ROUTE 1: RUN DEFAULTER DETECTION
// ============================================

// POST /api/defaulters/detect
// Purpose: Scan all patients and flag those who missed pickups
router.post('/detect', async (req, res) => {
    const client = await getClient();
    
    try {
        await client.query('BEGIN');
        
        const gracePeriod = parseInt(req.body.grace_period) || 3; // Days after missed pickup
        
        console.log('🔍 Running defaulter detection...');
        console.log(`   Grace period: ${gracePeriod} days`);

        // Find patients who missed their scheduled pickup date
        const missedPickups = await client.query(
            `SELECT DISTINCT ON (mp.patient_id)
                mp.patient_id,
                p.patient_number,
                p.first_name,
                p.last_name,
                p.phone_number,
                p.distance_from_clinic,
                mp.next_pickup_date as missed_pickup_date,
                CURRENT_DATE - mp.next_pickup_date as days_overdue,
                COUNT(d.defaulter_id) FILTER (WHERE d.status = 'returned') as previous_defaults
             FROM medication_pickups mp
             JOIN patients p ON mp.patient_id = p.patient_id
             LEFT JOIN defaulters d ON p.patient_id = d.patient_id
             WHERE mp.next_pickup_date < CURRENT_DATE - INTERVAL '1 day' * $1
             AND p.is_active = true
             AND NOT EXISTS (
                 SELECT 1 FROM medication_pickups mp2
                 WHERE mp2.patient_id = mp.patient_id
                 AND mp2.actual_pickup_date > mp.next_pickup_date
             )
             AND NOT EXISTS (
                 SELECT 1 FROM defaulters d2
                 WHERE d2.patient_id = mp.patient_id
                 AND d2.status = 'pending'
             )
             GROUP BY mp.patient_id, p.patient_number, p.first_name, p.last_name, 
                      p.phone_number, p.distance_from_clinic, mp.next_pickup_date
             ORDER BY mp.patient_id, mp.next_pickup_date DESC`,
            [gracePeriod]
        );

        const newDefaulters = [];

        // Flag each patient as defaulter
        for (const patient of missedPickups.rows) {
            // Calculate risk level
            const riskLevel = calculateRiskLevel(
                patient.days_overdue,
                patient.previous_defaults,
                patient.distance_from_clinic
            );

            // Insert defaulter record
            const result = await client.query(
                `INSERT INTO defaulters (
                    patient_id, missed_pickup_date, days_overdue, risk_level, status
                ) VALUES ($1, $2, $3, $4, 'pending')
                RETURNING *`,
                [patient.patient_id, patient.missed_pickup_date, patient.days_overdue, riskLevel]
            );

            newDefaulters.push({
                ...result.rows[0],
                patient_info: {
                    patient_number: patient.patient_number,
                    first_name: patient.first_name,
                    last_name: patient.last_name,
                    phone_number: patient.phone_number
                }
            });
        }

        await client.query('COMMIT');

        console.log(`✅ Defaulter detection complete`);
        console.log(`   Found ${newDefaulters.length} new defaulters`);

        res.json({
            success: true,
            message: 'Defaulter detection completed',
            detected: newDefaulters.length,
            defaulters: newDefaulters.map(d => ({
                ...d,
                missed_pickup_date_display: convertToDisplayDate(d.missed_pickup_date)
            }))
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Defaulter detection error:', error);
        res.status(500).json({
            success: false,
            message: 'Error during defaulter detection',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        client.release();
    }
});

// ============================================
// ROUTE 2: GET ALL DEFAULTERS
// ============================================

// GET /api/defaulters
// Purpose: Get list of current defaulters
router.get('/', async (req, res) => {
    try {
        const status = req.query.status || 'pending';
        const riskLevel = req.query.risk_level;

        console.log('📋 Fetching defaulters - Status:', status);

        let queryText = `
            SELECT 
                d.*,
                p.patient_number, p.first_name, p.last_name,
                p.phone_number, p.address, p.distance_from_clinic,
                u.full_name as resolved_by_name
            FROM defaulters d
            JOIN patients p ON d.patient_id = p.patient_id
            LEFT JOIN users u ON d.resolved_by = u.user_id
            WHERE d.status = $1
        `;

        const params = [status];

        if (riskLevel) {
            queryText += ` AND d.risk_level = $2`;
            params.push(riskLevel);
        }

        queryText += ` ORDER BY d.risk_level DESC, d.days_overdue DESC`;

        const result = await query(queryText, params);

        // Convert dates and add display info
        const defaulters = result.rows.map(defaulter => ({
            ...defaulter,
            missed_pickup_date_display: convertToDisplayDate(defaulter.missed_pickup_date),
            flagged_date_display: convertToDisplayDate(defaulter.flagged_date),
            resolved_date_display: defaulter.resolved_date ? convertToDisplayDate(defaulter.resolved_date) : null
        }));

        res.json({
            success: true,
            message: 'Defaulters retrieved successfully',
            count: defaulters.length,
            defaulters: defaulters
        });

    } catch (error) {
        console.error('❌ Error fetching defaulters:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching defaulters',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ============================================
// ROUTE 3: GET DEFAULTER STATISTICS
// ============================================

// GET /api/defaulters/stats
// Purpose: Get summary statistics about defaulters
router.get('/stats', async (req, res) => {
    try {
        console.log('📊 Fetching defaulter statistics');

        const stats = await query(`
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

        res.json({
            success: true,
            message: 'Statistics retrieved successfully',
            stats: {
                ...stats.rows[0],
                avg_days_overdue: Math.round(parseFloat(stats.rows[0].avg_days_overdue) || 0)
            }
        });

    } catch (error) {
        console.error('❌ Error fetching statistics:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching statistics',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ============================================
// ROUTE 4: RECORD FOLLOW-UP ACTION
// ============================================

// POST /api/defaulters/:id/followup
// Purpose: Record a follow-up action for a defaulter
router.post('/:id/followup', async (req, res) => {
    try {
        const defaulterId = req.params.id;
        const { action_type, outcome, notes } = req.body;

        console.log('📞 Recording follow-up for defaulter:', defaulterId);

        // Validate action type
        const validTypes = ['phone_call', 'sms', 'home_visit', 'other'];
        if (!validTypes.includes(action_type)) {
            return res.status(400).json({
                success: false,
                message: `Action type must be one of: ${validTypes.join(', ')}`
            });
        }

        // Check if defaulter exists
        const defaulterCheck = await query(
            'SELECT defaulter_id FROM defaulters WHERE defaulter_id = $1',
            [defaulterId]
        );

        if (defaulterCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Defaulter record not found'
            });
        }

        // Insert follow-up action
        const result = await query(
            `INSERT INTO followup_actions (
                defaulter_id, action_type, action_date, outcome, notes, performed_by
            ) VALUES ($1, $2, CURRENT_TIMESTAMP, $3, $4, $5)
            RETURNING *`,
            [defaulterId, action_type, outcome || null, notes || null, req.user.user_id]
        );

        console.log('✅ Follow-up action recorded');

        res.status(201).json({
            success: true,
            message: 'Follow-up action recorded successfully',
            followup: result.rows[0]
        });

    } catch (error) {
        console.error('❌ Error recording follow-up:', error);
        res.status(500).json({
            success: false,
            message: 'Error recording follow-up',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ============================================
// ROUTE 5: UPDATE DEFAULTER STATUS
// ============================================

// PUT /api/defaulters/:id/status
// Purpose: Update defaulter status (e.g., mark as returned, lost to follow-up)
router.put('/:id/status', async (req, res) => {
    try {
        const defaulterId = req.params.id;
        const { status } = req.body;

        console.log('✏️ Updating defaulter status:', defaulterId, '→', status);

        // Validate status
        const validStatuses = ['pending', 'contacted', 'returned', 'lost_to_followup', 'transferred', 'deceased'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: `Status must be one of: ${validStatuses.join(', ')}`
            });
        }

        // Update status
        const result = await query(
            `UPDATE defaulters SET
                status = $1,
                resolved_date = CASE WHEN $1 != 'pending' THEN CURRENT_TIMESTAMP ELSE NULL END,
                resolved_by = CASE WHEN $1 != 'pending' THEN $2 ELSE NULL END
             WHERE defaulter_id = $3
             RETURNING *`,
            [status, req.user.user_id, defaulterId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Defaulter not found'
            });
        }

        console.log('✅ Status updated successfully');

        res.json({
            success: true,
            message: 'Defaulter status updated successfully',
            defaulter: {
                ...result.rows[0],
                resolved_date_display: result.rows[0].resolved_date ? 
                    convertToDisplayDate(result.rows[0].resolved_date) : null
            }
        });

    } catch (error) {
        console.error('❌ Error updating status:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating status',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ============================================
// HELPER FUNCTIONS
// ============================================

// Calculate risk level based on multiple factors
const calculateRiskLevel = (daysOverdue, previousDefaults, distanceFromClinic) => {
    let score = 0;

    // Days overdue factor
    if (daysOverdue >= 14) score += 3;
    else if (daysOverdue >= 7) score += 2;
    else score += 1;

    // Previous defaults factor
    if (previousDefaults >= 3) score += 3;
    else if (previousDefaults >= 1) score += 2;

    // Distance factor
    if (distanceFromClinic > 15) score += 2;
    else if (distanceFromClinic > 5) score += 1;

    // Determine risk level
    if (score >= 6) return 'high';
    if (score >= 3) return 'medium';
    return 'low';
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