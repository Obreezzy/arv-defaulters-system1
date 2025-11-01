// backend/routes/pickups.js
// Handles medication pickup recording and tracking

const express = require('express');
const { query, getClient } = require('../config/db');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(verifyToken);

// ============================================
// ROUTE 1: RECORD MEDICATION PICKUP
// ============================================

// POST /api/pickups
// Purpose: Record when a patient collects their medication
router.post('/', async (req, res) => {
    const client = await getClient();
    
    try {
        await client.query('BEGIN');
        
        const {
            patient_id,
            treatment_id,
            actual_pickup_date,
            days_supply,
            quantity_dispensed,
            notes
        } = req.body;

        console.log('💊 Recording pickup for patient:', patient_id);

        // Validate required fields
        if (!patient_id || !treatment_id || !actual_pickup_date || !days_supply) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                success: false,
                message: 'Required fields: patient_id, treatment_id, actual_pickup_date, days_supply'
            });
        }

        // Check if patient exists
        const patientCheck = await client.query(
            'SELECT patient_id, first_name, last_name FROM patients WHERE patient_id = $1',
            [patient_id]
        );

        if (patientCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                success: false,
                message: 'Patient not found'
            });
        }

        // Calculate next pickup date
        const pickupDate = new Date(actual_pickup_date);
        const nextPickupDate = new Date(pickupDate);
        nextPickupDate.setDate(nextPickupDate.getDate() + parseInt(days_supply));
        
        const scheduledDate = nextPickupDate.toISOString().split('T')[0];

        // Insert pickup record
        const pickupResult = await client.query(
            `INSERT INTO medication_pickups (
                patient_id, treatment_id, scheduled_date, actual_pickup_date,
                next_pickup_date, quantity_dispensed, days_supply, notes, recorded_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *`,
            [
                patient_id, treatment_id, scheduledDate, actual_pickup_date,
                scheduledDate, quantity_dispensed || null, days_supply,
                notes || null, req.user.user_id
            ]
        );

        const pickup = pickupResult.rows[0];

        // Check if patient was flagged as defaulter and resolve it
        const defaulterCheck = await client.query(
            `SELECT defaulter_id FROM defaulters 
             WHERE patient_id = $1 AND status = 'pending'`,
            [patient_id]
        );

        if (defaulterCheck.rows.length > 0) {
            await client.query(
                `UPDATE defaulters SET
                    status = 'returned',
                    resolved_date = CURRENT_TIMESTAMP,
                    resolved_by = $1
                 WHERE patient_id = $2 AND status = 'pending'`,
                [req.user.user_id, patient_id]
            );
            console.log('✅ Patient removed from defaulter list');
        }

        await client.query('COMMIT');

        console.log('✅ Pickup recorded successfully:', pickup.pickup_id);

        res.status(201).json({
            success: true,
            message: 'Medication pickup recorded successfully',
            pickup: {
                ...pickup,
                next_pickup_date_display: convertToDisplayDate(pickup.next_pickup_date)
            }
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Pickup recording error:', error);
        res.status(500).json({
            success: false,
            message: 'Error recording pickup',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        client.release();
    }
});

// ============================================
// ROUTE 2: GET PATIENT PICKUP HISTORY
// ============================================

// GET /api/pickups/patient/:patient_id
// Purpose: Get all pickups for a specific patient
router.get('/patient/:patient_id', async (req, res) => {
    try {
        const patientId = req.params.patient_id;

        console.log('📋 Fetching pickup history for patient:', patientId);

        const result = await query(
            `SELECT 
                mp.*,
                p.first_name, p.last_name, p.patient_number,
                u.full_name as recorded_by_name
             FROM medication_pickups mp
             JOIN patients p ON mp.patient_id = p.patient_id
             LEFT JOIN users u ON mp.recorded_by = u.user_id
             WHERE mp.patient_id = $1
             ORDER BY mp.actual_pickup_date DESC`,
            [patientId]
        );

        // Convert dates to display format
        const pickups = result.rows.map(pickup => ({
            ...pickup,
            actual_pickup_date_display: convertToDisplayDate(pickup.actual_pickup_date),
            next_pickup_date_display: convertToDisplayDate(pickup.next_pickup_date),
            scheduled_date_display: convertToDisplayDate(pickup.scheduled_date)
        }));

        res.json({
            success: true,
            message: 'Pickup history retrieved successfully',
            count: pickups.length,
            pickups: pickups
        });

    } catch (error) {
        console.error('❌ Error fetching pickup history:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching pickup history',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ============================================
// ROUTE 3: GET RECENT PICKUPS
// ============================================

// GET /api/pickups/recent
// Purpose: Get recent pickups across all patients
router.get('/recent', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;

        console.log('📋 Fetching recent pickups');

        const result = await query(
            `SELECT 
                mp.*,
                p.first_name, p.last_name, p.patient_number, p.phone_number,
                u.full_name as recorded_by_name
             FROM medication_pickups mp
             JOIN patients p ON mp.patient_id = p.patient_id
             LEFT JOIN users u ON mp.recorded_by = u.user_id
             ORDER BY mp.created_at DESC
             LIMIT $1`,
            [limit]
        );

        // Convert dates
        const pickups = result.rows.map(pickup => ({
            ...pickup,
            actual_pickup_date_display: convertToDisplayDate(pickup.actual_pickup_date),
            next_pickup_date_display: convertToDisplayDate(pickup.next_pickup_date)
        }));

        res.json({
            success: true,
            message: 'Recent pickups retrieved successfully',
            pickups: pickups
        });

    } catch (error) {
        console.error('❌ Error fetching recent pickups:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching recent pickups',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ============================================
// ROUTE 4: GET UPCOMING PICKUPS
// ============================================

// GET /api/pickups/upcoming
// Purpose: Get patients with upcoming pickups (next 7 days)
router.get('/upcoming', async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 7;

        console.log(`📅 Fetching upcoming pickups (next ${days} days)`);

        const result = await query(
            `SELECT DISTINCT ON (p.patient_id)
                p.patient_id, p.patient_number, p.first_name, p.last_name,
                p.phone_number, mp.next_pickup_date,
                CURRENT_DATE - mp.next_pickup_date as days_until
             FROM patients p
             JOIN medication_pickups mp ON p.patient_id = mp.patient_id
             WHERE mp.next_pickup_date BETWEEN CURRENT_DATE AND CURRENT_DATE + $1
             AND p.is_active = true
             ORDER BY p.patient_id, mp.next_pickup_date DESC`,
            [days]
        );

        // Convert dates
        const upcoming = result.rows.map(item => ({
            ...item,
            next_pickup_date_display: convertToDisplayDate(item.next_pickup_date)
        }));

        res.json({
            success: true,
            message: 'Upcoming pickups retrieved successfully',
            count: upcoming.length,
            upcoming: upcoming
        });

    } catch (error) {
        console.error('❌ Error fetching upcoming pickups:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching upcoming pickups',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ============================================
// HELPER FUNCTIONS
// ============================================

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