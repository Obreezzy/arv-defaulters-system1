/**
 * backend/routes/pickups.js
 * Rewritten for new schema — pickups are stored as visits.
 */

const express = require('express');
const router  = express.Router();
const { query } = require('../config/db');
const { verifyToken } = require('../middleware/auth');

router.use(verifyToken);

// ─────────────────────────────────────────────────────────────────
// POST /api/pickups/record
// Records a medication pickup as a new visit row
// ─────────────────────────────────────────────────────────────────
router.post('/record', async (req, res) => {
    const {
        patient_id, days_dispensed,
        next_pickup_date, regimen, dsd_model,
        viral_load_result, viral_load_date,
        weight_kg, notes,
        scheduled_next_appt_date,
    } = req.body;

    // Accept visit_date OR pickup_date (frontend sends visit_date)
    const pickup_date = req.body.visit_date || req.body.pickup_date;

    if (!patient_id) return res.status(400).json({ success: false, message: 'patient_id is required' });
    if (!pickup_date) return res.status(400).json({ success: false, message: 'visit_date is required' });

    try {
        // Verify patient exists
        const patCheck = await query(
            `SELECT patient_id FROM patients WHERE patient_id = $1`,
            [patient_id]
        );
        if (patCheck.rows.length === 0)
            return res.status(404).json({ success: false, message: 'Patient not found' });

        // Auto-calculate next pickup date if not provided
        const freq = parseInt(days_dispensed) || 30;
        const computedNext = scheduled_next_appt_date || next_pickup_date || (() => {
            const d = new Date(pickup_date);
            d.setDate(d.getDate() + freq);
            return d.toISOString().split('T')[0];
        })();

        // Generate visit_id
        const visit_id = `V${Date.now()}`;

        const result = await query(`
            INSERT INTO visits (
                visit_id, patient_id, visit_date, days_dispensed,
                scheduled_next_appt_date, regimen, dsd_model,
                viral_load_result, viral_load_date, weight_kg
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
            RETURNING *
        `, [
            visit_id, patient_id, pickup_date, freq,
            computedNext, regimen || null, dsd_model || 'facility',
            viral_load_result || null, viral_load_date || null,
            weight_kg || null,
        ]);

        // Remove from defaulters if currently defaulting
        await query(`
            UPDATE defaulters SET status = 'resolved'
            WHERE patient_id = $1 AND status = 'pending'
        `, [patient_id]);

        res.json({
            success: true,
            message: 'Pickup recorded successfully',
            visit: result.rows[0],
            next_pickup_date: computedNext,
        });

    } catch (err) {
        console.error('Record pickup error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/pickups/patient/:patient_id
// ─────────────────────────────────────────────────────────────────
router.get('/patient/:patient_id', async (req, res) => {
    try {
        const result = await query(`
            SELECT * FROM visits
            WHERE patient_id = $1
            ORDER BY visit_date DESC
        `, [req.params.patient_id]);

        res.json({ success: true, count: result.rows.length, pickups: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/pickups/upcoming
// ─────────────────────────────────────────────────────────────────
router.get('/upcoming', async (req, res) => {
    const days = parseInt(req.query.days) || 7;
    try {
        const result = await query(`
            SELECT DISTINCT ON (v.patient_id)
                v.patient_id, v.scheduled_next_appt_date,
                v.days_dispensed, v.regimen,
                p.sex, p.residence_district, p.phone_available,
                f.facility_name
            FROM visits v
            JOIN patients  p ON v.patient_id  = p.patient_id
            JOIN facilities f ON p.facility_id = f.facility_id
            WHERE v.scheduled_next_appt_date BETWEEN CURRENT_DATE
              AND CURRENT_DATE + ($1 || ' days')::INTERVAL
              AND p.exit_status = 'active'
            ORDER BY v.patient_id, v.visit_date DESC
        `, [days]);

        res.json({ success: true, count: result.rows.length, upcoming: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/pickups/recent
// ─────────────────────────────────────────────────────────────────
router.get('/recent', async (req, res) => {
    const limit = parseInt(req.query.limit) || 20;
    try {
        const result = await query(`
            SELECT v.*, p.sex, p.residence_district, f.facility_name
            FROM visits v
            JOIN patients  p ON v.patient_id  = p.patient_id
            JOIN facilities f ON p.facility_id = f.facility_id
            ORDER BY v.visit_date DESC
            LIMIT $1
        `, [limit]);

        res.json({ success: true, count: result.rows.length, pickups: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;