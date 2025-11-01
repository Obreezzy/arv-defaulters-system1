// backend/routes/patients.js
// Handles patient registration and management

const express = require('express');
const { query } = require('../config/db');
const { verifyToken, verifyRole } = require('../middleware/auth');

const router = express.Router();

// All routes in this file require authentication
router.use(verifyToken);

// ============================================
// ROUTE 1: REGISTER NEW PATIENT
// ============================================

// POST /api/patients
// Purpose: Register a new patient in the system
router.post('/', async (req, res) => {
    try {
        const {
            patient_number,
            first_name,
            last_name,
            date_of_birth,
            gender,
            phone_number,
            alternative_phone,
            address,
            distance_from_clinic,
            emergency_contact_name,
            emergency_contact_phone,
            enrollment_date
        } = req.body;

        console.log('📝 Patient registration attempt:', patient_number);

        // Validate required fields
        if (!patient_number || !first_name || !last_name || !date_of_birth || !gender || !enrollment_date) {
            return res.status(400).json({
                success: false,
                message: 'Please provide all required fields: patient_number, first_name, last_name, date_of_birth, gender, enrollment_date'
            });
        }

        // Validate gender
        if (!['Male', 'Female', 'Other'].includes(gender)) {
            return res.status(400).json({
                success: false,
                message: 'Gender must be Male, Female, or Other'
            });
        }

        // Check if patient number already exists
        const existingPatient = await query(
            'SELECT patient_id FROM patients WHERE patient_number = $1',
            [patient_number]
        );

        if (existingPatient.rows.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'Patient number already exists. Please use a unique patient number.'
            });
        }

        // Insert patient
        const result = await query(
            `INSERT INTO patients (
                patient_number, first_name, last_name, date_of_birth, gender,
                phone_number, alternative_phone, address, distance_from_clinic,
                emergency_contact_name, emergency_contact_phone, enrollment_date,
                is_active, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            RETURNING *`,
            [
                patient_number, first_name, last_name, date_of_birth, gender,
                phone_number || null, alternative_phone || null, address || null,
                distance_from_clinic || null, emergency_contact_name || null,
                emergency_contact_phone || null, enrollment_date, true, req.user.user_id
            ]
        );

        const newPatient = result.rows[0];

        console.log('✅ Patient registered successfully:', newPatient.patient_id);

        res.status(201).json({
            success: true,
            message: 'Patient registered successfully',
            patient: newPatient
        });

    } catch (error) {
        console.error('❌ Patient registration error:', error);
        res.status(500).json({
            success: false,
            message: 'Error registering patient',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ============================================
// ROUTE 2: GET ALL PATIENTS
// ============================================

// GET /api/patients
// Purpose: Get list of all patients with pagination
router.get('/', async (req, res) => {
    try {
        // Get query parameters for pagination and filtering
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        const search = req.query.search || '';
        const active_only = req.query.active_only === 'true';

        console.log('📋 Fetching patients - Page:', page, 'Limit:', limit);

        // Build query
        let queryText = `
            SELECT p.*, u.full_name as registered_by_name
            FROM patients p
            LEFT JOIN users u ON p.created_by = u.user_id
            WHERE 1=1
        `;
        
        const queryParams = [];
        let paramCount = 0;

        // Add search filter
        if (search) {
            paramCount++;
            queryText += ` AND (
                p.patient_number ILIKE $${paramCount} OR
                p.first_name ILIKE $${paramCount} OR
                p.last_name ILIKE $${paramCount} OR
                p.phone_number ILIKE $${paramCount}
            )`;
            queryParams.push(`%${search}%`);
        }

        // Add active filter
        if (active_only) {
            queryText += ` AND p.is_active = true`;
        }

        // Get total count
        const countResult = await query(
            queryText.replace('SELECT p.*, u.full_name as registered_by_name', 'SELECT COUNT(*) as total'),
            queryParams
        );
        const totalPatients = parseInt(countResult.rows[0].total);

        // Add pagination
        queryText += ` ORDER BY p.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
        queryParams.push(limit, offset);

        // Get patients
        const result = await query(queryText, queryParams);

        res.json({
            success: true,
            message: 'Patients retrieved successfully',
            pagination: {
                page,
                limit,
                total: totalPatients,
                totalPages: Math.ceil(totalPatients / limit)
            },
            patients: result.rows
        });

    } catch (error) {
        console.error('❌ Error fetching patients:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching patients',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ============================================
// ROUTE 3: GET SINGLE PATIENT
// ============================================

// GET /api/patients/:id
// Purpose: Get detailed information about a specific patient
router.get('/:id', async (req, res) => {
    try {
        const patientId = req.params.id;

        console.log('👤 Fetching patient:', patientId);

        const result = await query(
            `SELECT p.*, u.full_name as registered_by_name
             FROM patients p
             LEFT JOIN users u ON p.created_by = u.user_id
             WHERE p.patient_id = $1`,
            [patientId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Patient not found'
            });
        }

        res.json({
            success: true,
            message: 'Patient retrieved successfully',
            patient: result.rows[0]
        });

    } catch (error) {
        console.error('❌ Error fetching patient:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching patient',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ============================================
// ROUTE 4: UPDATE PATIENT
// ============================================

// PUT /api/patients/:id
// Purpose: Update patient information
router.put('/:id', async (req, res) => {
    try {
        const patientId = req.params.id;
        const {
            first_name,
            last_name,
            phone_number,
            alternative_phone,
            address,
            distance_from_clinic,
            emergency_contact_name,
            emergency_contact_phone,
            is_active
        } = req.body;

        console.log('✏️ Updating patient:', patientId);

        // Check if patient exists
        const existingPatient = await query(
            'SELECT patient_id FROM patients WHERE patient_id = $1',
            [patientId]
        );

        if (existingPatient.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Patient not found'
            });
        }

        // Update patient
        const result = await query(
            `UPDATE patients SET
                first_name = COALESCE($1, first_name),
                last_name = COALESCE($2, last_name),
                phone_number = COALESCE($3, phone_number),
                alternative_phone = $4,
                address = $5,
                distance_from_clinic = $6,
                emergency_contact_name = $7,
                emergency_contact_phone = $8,
                is_active = COALESCE($9, is_active),
                updated_at = CURRENT_TIMESTAMP
             WHERE patient_id = $10
             RETURNING *`,
            [
                first_name, last_name, phone_number, alternative_phone,
                address, distance_from_clinic, emergency_contact_name,
                emergency_contact_phone, is_active, patientId
            ]
        );

        console.log('✅ Patient updated successfully:', patientId);

        res.json({
            success: true,
            message: 'Patient updated successfully',
            patient: result.rows[0]
        });

    } catch (error) {
        console.error('❌ Error updating patient:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating patient',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ============================================
// ROUTE 5: GET PATIENT STATISTICS
// ============================================

// GET /api/patients/stats/summary
// Purpose: Get summary statistics about patients
router.get('/stats/summary', async (req, res) => {
    try {
        console.log('📊 Fetching patient statistics');

        const stats = await query(`
            SELECT
                COUNT(*) as total_patients,
                COUNT(*) FILTER (WHERE is_active = true) as active_patients,
                COUNT(*) FILTER (WHERE is_active = false) as inactive_patients,
                COUNT(*) FILTER (WHERE gender = 'Male') as male_patients,
                COUNT(*) FILTER (WHERE gender = 'Female') as female_patients,
                COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '30 days') as new_this_month
            FROM patients
        `);

        res.json({
            success: true,
            message: 'Statistics retrieved successfully',
            stats: stats.rows[0]
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

module.exports = router;