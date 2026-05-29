/**
 * routes/defaulters.js
 * --------------------
 * Handles defaulter detection and AI risk analysis.
 * Works with the new schema (patients/visits/facilities/stockouts).
 */

const express = require('express');
const router  = express.Router();
const { query } = require('../config/db');
const { verifyToken } = require('../middleware/auth');
const { calculateRiskScore, batchCalculateRisk } = require('../services/riskEngine');

router.use(verifyToken);

// ─────────────────────────────────────────────────────────────────
// 1. GET ALL DEFAULTERS
//    Auto-detects patients whose latest scheduled pickup has passed
// ─────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
    try {
        // Find patients whose latest scheduled_next_appt_date has passed by 3+ days
        // and who are still active — insert them as new defaulters
        const missed = await query(`
            SELECT DISTINCT ON (v.patient_id)
                v.patient_id,
                v.scheduled_next_appt_date,
                (CURRENT_DATE - v.scheduled_next_appt_date) AS days_overdue
            FROM visits v
            JOIN patients p ON v.patient_id = p.patient_id
            WHERE v.scheduled_next_appt_date <= CURRENT_DATE - 3
              AND p.exit_status = 'active'
              AND v.patient_id NOT IN (SELECT patient_id FROM defaulters)
            ORDER BY v.patient_id, v.visit_date DESC
        `);

        for (const row of missed.rows) {
            const days = parseInt(row.days_overdue) || 3;
            const risk = days > 14 ? 'High' : days > 7 ? 'Medium' : 'Low';
            await query(
                `INSERT INTO defaulters (patient_id, days_overdue, risk_level, status, detected_date)
                 VALUES ($1, $2, $3, 'pending', CURRENT_DATE)
                 ON CONFLICT (patient_id) DO NOTHING`,
                [row.patient_id, days, risk]
            );
        }

        // Update days_overdue for existing pending defaulters
        await query(`
            UPDATE defaulters d
            SET days_overdue = (
                SELECT CURRENT_DATE - MAX(v.scheduled_next_appt_date)
                FROM visits v WHERE v.patient_id = d.patient_id
            )
            WHERE d.status = 'pending'
        `);

        // Clean up any that slipped in under 3 days
        await query(`DELETE FROM defaulters WHERE status = 'pending' AND days_overdue < 3`);

        // Return final list with patient name from patients table
        const result = await query(`
            SELECT
                d.defaulter_id,
                d.patient_id,
                d.days_overdue,
                d.status,
                d.detected_date,
                d.risk_level,
                d.notes,
                p.sex,
                p.art_start_date,
                p.residence_district,
                p.phone_available,
                f.facility_name,
                f.catchment_type
            FROM defaulters d
            JOIN patients  p ON d.patient_id  = p.patient_id
            JOIN facilities f ON p.facility_id = f.facility_id
            WHERE d.status = 'pending'
            ORDER BY d.days_overdue DESC
        `);

        res.json({ success: true, defaulters: result.rows });

    } catch (err) {
        console.error('Error fetching defaulters:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────
// 2. AI RISK ANALYSIS — single patient (frontend button)
//    POST /api/defaulters/:patient_id/risk
// ─────────────────────────────────────────────────────────────────
router.post('/:patient_id/risk', async (req, res) => {
    const { patient_id } = req.params;

    try {
        const risk = await calculateRiskScore(patient_id);

        // Persist the result so the dashboard can show it without re-running
        await query(`
            INSERT INTO risk_scores
              (patient_id, default_probability, predicted_default, risk_tier,
               threshold_used, threshold_source, warnings)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
            patient_id,
            risk.probability,
            risk.predicted_default,
            risk.label.toLowerCase(),
            risk.threshold_used,
            risk.threshold_source,
            JSON.stringify(risk.warnings),
        ]);

        // Also update the risk_level on the defaulters table if they are a defaulter
        await query(`
            UPDATE defaulters SET risk_level = $1
            WHERE patient_id = $2 AND status = 'pending'
        `, [risk.label, patient_id]);

        res.json({
            success:  true,
            patient_id,
            risk,
        });

    } catch (err) {
        if (err.status === 404) return res.status(404).json({ success: false, message: err.message });
        if (err.status === 422) return res.status(422).json({ success: false, message: err.message });

        // ML API down
        if (err.code === 'ECONNREFUSED' || err.code === 'ECONNABORTED') {
            return res.status(503).json({ success: false, message: 'ML service unavailable. Is Flask running?' });
        }

        console.error('Risk analysis error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────
// 3. BATCH AI RISK ANALYSIS — all pending defaulters
//    POST /api/defaulters/risk/batch
// ─────────────────────────────────────────────────────────────────
router.post('/risk/batch', async (req, res) => {
    try {
        const pending = await query(
            `SELECT patient_id FROM defaulters WHERE status = 'pending'`
        );
        const ids = pending.rows.map(r => r.patient_id);

        if (ids.length === 0) {
            return res.json({ success: true, message: 'No pending defaulters to score', results: [] });
        }

        const { results, errors } = await batchCalculateRisk(ids);

        // Persist all results
        for (const r of results) {
            await query(`
                INSERT INTO risk_scores
                  (patient_id, default_probability, predicted_default, risk_tier,
                   threshold_used, threshold_source, warnings)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, [
                r.patient_id, r.probability, r.predicted_default,
                r.label.toLowerCase(), r.threshold_used,
                r.threshold_source, JSON.stringify(r.warnings),
            ]);

            await query(`
                UPDATE defaulters SET risk_level = $1
                WHERE patient_id = $2 AND status = 'pending'
            `, [r.label, r.patient_id]);
        }

        res.json({
            success: true,
            scored:  results.length,
            errors:  errors.length,
            results,
            ...(errors.length > 0 && { error_details: errors }),
        });

    } catch (err) {
        console.error('Batch risk error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────
// 4. RESOLVE DEFAULTER STATUS
//    PUT /api/defaulters/:id/resolve
// ─────────────────────────────────────────────────────────────────
router.put('/:id/resolve', async (req, res) => {
    const { status, notes } = req.body;

    try {
        const result = await query(
            `UPDATE defaulters
             SET status = $1, notes = $2
             WHERE defaulter_id = $3
             RETURNING *`,
            [status, notes || null, req.params.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Defaulter not found' });
        }

        res.json({ success: true, data: result.rows[0] });

    } catch (err) {
        console.error('Resolve error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;