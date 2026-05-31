/**
 * backend/routes/patients.js
 * Fully rewritten for the new arv_inference schema.
 */

const express = require('express');
const router  = express.Router();
const { query } = require('../config/db');
const { verifyToken } = require('../middleware/auth');
const { calculateRiskScore } = require('../services/riskEngine');

router.use(verifyToken);

// ─────────────────────────────────────────────────────────────────
// HELPER: derive display name from patient record
// ─────────────────────────────────────────────────────────────────
const displayName = (p) => {
    // New schema has no first_name/last_name — use patient_id as fallback
    return p.display_name || p.patient_id;
};

// ─────────────────────────────────────────────────────────────────
// HELPER: calculate age
// ─────────────────────────────────────────────────────────────────
const getAge = (dob) => {
    if (!dob) return null;
    return Math.floor((new Date() - new Date(dob)) / (365.25 * 24 * 60 * 60 * 1000));
};

// ─────────────────────────────────────────────────────────────────
// HELPER: haversine distance
// ─────────────────────────────────────────────────────────────────
const haversineKm = (lat1, lon1, lat2, lon2) => {
    if (!lat1 || !lon1 || !lat2 || !lon2) return null;
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 +
              Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLon/2)**2;
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
};

// ─────────────────────────────────────────────────────────────────
// 1. GET ALL PATIENTS
// ─────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
    try {
        const result = await query(`
            SELECT
                p.patient_id,
                p.first_name,
                p.last_name,
                p.facility_id,
                p.sex,
                p.date_of_birth,
                p.art_start_date,
                p.residence_district,
                p.residence_gps_lat,
                p.residence_gps_lon,
                p.self_reported_travel_time_min,
                p.phone_available,
                p.phone_number,
                p.next_of_kin_name,
                p.next_of_kin_phone,
                p.marital_status,
                p.education_level,
                p.occupation,
                p.exit_status,
                p.who_stage_at_enrolment,
                p.baseline_cd4,
                f.facility_name,
                f.catchment_type,
                f.gps_lat  AS facility_lat,
                f.gps_lon  AS facility_lon,
                -- Latest risk score
                rs.default_probability,
                rs.risk_tier,
                rs.scored_at,
                -- Latest visit's scheduled next appt
                lv.scheduled_next_appt_date AS next_pickup_date,
                lv.visit_date               AS last_visit_date,
                lv.days_dispensed,
                lv.regimen
            FROM patients p
            LEFT JOIN facilities f  ON p.facility_id = f.facility_id
            LEFT JOIN LATERAL (
                SELECT default_probability, risk_tier, scored_at
                FROM risk_scores
                WHERE patient_id = p.patient_id
                ORDER BY scored_at DESC LIMIT 1
            ) rs ON true
            LEFT JOIN LATERAL (
                SELECT scheduled_next_appt_date, visit_date, days_dispensed, regimen
                FROM visits
                WHERE patient_id = p.patient_id
                ORDER BY visit_date DESC LIMIT 1
            ) lv ON true
            WHERE p.exit_status = 'active'
            ORDER BY rs.default_probability DESC NULLS LAST
        `);

        const data = result.rows.map(p => ({
            ...p,
            age:           getAge(p.date_of_birth),
            distance_km:   haversineKm(p.residence_gps_lat, p.residence_gps_lon, p.facility_lat, p.facility_lon),
            // Map new fields to names the frontend already uses
            risk_score:    p.default_probability != null ? Math.round(p.default_probability * 100) : null,
            risk_level:    p.risk_tier ? (p.risk_tier.charAt(0).toUpperCase() + p.risk_tier.slice(1)) : null,
            is_active:     p.exit_status === 'active',
        }));

        res.json({ success: true, data });
    } catch (err) {
        console.error('GET /patients error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────
// 2. GET SINGLE PATIENT
// ─────────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
    try {
        const result = await query(`
            SELECT p.*, f.facility_name, f.catchment_type, f.gps_lat, f.gps_lon,
                   rs.default_probability, rs.risk_tier, rs.scored_at,
                   rs.threshold_used, rs.threshold_source
            FROM patients p
            LEFT JOIN facilities f ON p.facility_id = f.facility_id
            LEFT JOIN LATERAL (
                SELECT default_probability, risk_tier, scored_at, threshold_used, threshold_source
                FROM risk_scores WHERE patient_id = p.patient_id
                ORDER BY scored_at DESC LIMIT 1
            ) rs ON true
            WHERE p.patient_id = $1
        `, [req.params.id]);

        if (result.rows.length === 0)
            return res.status(404).json({ success: false, message: 'Patient not found' });

        const p = result.rows[0];
        res.json({
            success: true,
            patient: {
                ...p,
                age:        getAge(p.date_of_birth),
                distance_km: haversineKm(p.residence_gps_lat, p.residence_gps_lon, p.gps_lat, p.gps_lon),
                risk_score: p.default_probability != null ? Math.round(p.default_probability * 100) : null,
                risk_level: p.risk_tier ? (p.risk_tier.charAt(0).toUpperCase() + p.risk_tier.slice(1)) : null,
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────
// 3. CREATE PATIENT
// ─────────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
    const {
        patient_id, facility_id, sex, date_of_birth, art_start_date,
        hiv_diagnosis_date, who_stage_at_enrolment, baseline_cd4,
        residence_province, residence_district, residence_village,
        residence_ward, residence_gps_lat, residence_gps_lon,
        self_reported_travel_time_min, phone_available,
        phone_number, next_of_kin_name, next_of_kin_phone,
        marital_status, education_level, occupation, disclosure_status,
        registered_by,
    } = req.body;

    if (!art_start_date) {
        return res.status(400).json({ success: false, message: 'art_start_date is required' });
    }
    if (!facility_id) {
        return res.status(400).json({ success: false, message: 'facility_id is required' });
    }

    // Auto-generate patient_id if not provided
    const pid = patient_id || `PT${Date.now()}`;

    try {
        // Auto-fill GPS from facility if patient GPS not provided
        let autoLat = residence_gps_lat || null;
        let autoLon = residence_gps_lon || null;
        if ((!autoLat || !autoLon) && facility_id) {
            const facRes = await query(
                `SELECT gps_lat, gps_lon FROM facilities WHERE facility_id = $1`,
                [facility_id]
            );
            if (facRes.rows.length > 0) {
                autoLat = autoLat || facRes.rows[0].gps_lat || null;
                autoLon = autoLon || facRes.rows[0].gps_lon || null;
            }
        }

        const result = await query(`
            INSERT INTO patients (
                patient_id, facility_id, sex, date_of_birth, art_start_date,
                hiv_diagnosis_date, who_stage_at_enrolment, baseline_cd4,
                residence_province, residence_district, residence_village,
                residence_ward, residence_gps_lat, residence_gps_lon,
                self_reported_travel_time_min, phone_available,
                phone_number, next_of_kin_name, next_of_kin_phone,
                marital_status, education_level, occupation,
                disclosure_status, registered_by, exit_status
            ) VALUES (
                $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
                $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,'active'
            ) RETURNING *
        `, [
            pid, facility_id, sex || null, date_of_birth || null, art_start_date,
            hiv_diagnosis_date || null, who_stage_at_enrolment || null, baseline_cd4 || null,
            residence_province || null, residence_district || null, residence_village || null,
            residence_ward || null, autoLat, autoLon,
            self_reported_travel_time_min || null, phone_available || null,
            phone_number || null, next_of_kin_name || null, next_of_kin_phone || null,
            marital_status || null, education_level || null, occupation || null,
            disclosure_status || null,
            registered_by || null,
        ]);

        res.status(201).json({ success: true, patient: result.rows[0] });
    } catch (err) {
        console.error('CREATE patient error:', err);
        if (err.code === '23505') {
            return res.status(409).json({ success: false, message: 'Patient ID already exists' });
        }
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────
// 4. UPDATE PATIENT
// ─────────────────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
    const {
        sex, date_of_birth, hiv_diagnosis_date, who_stage_at_enrolment,
        baseline_cd4, residence_province, residence_district, residence_village,
        residence_ward, residence_gps_lat, residence_gps_lon,
        self_reported_travel_time_min, phone_available,
        phone_number, next_of_kin_name, next_of_kin_phone,
        marital_status, education_level, occupation, disclosure_status,
        registered_by,
    } = req.body;

    try {
        const result = await query(`
            UPDATE patients SET
                sex=$1, date_of_birth=$2, hiv_diagnosis_date=$3,
                who_stage_at_enrolment=$4, baseline_cd4=$5,
                residence_province=$6, residence_district=$7,
                residence_village=$8, residence_ward=$9,
                residence_gps_lat=$10, residence_gps_lon=$11,
                self_reported_travel_time_min=$12, phone_available=$13,
                phone_number=$14, next_of_kin_name=$15, next_of_kin_phone=$16,
                marital_status=$17, education_level=$18,
                occupation=$19, disclosure_status=$20
            WHERE patient_id=$21 RETURNING *
        `, [
            sex || null, date_of_birth || null, hiv_diagnosis_date || null,
            who_stage_at_enrolment || null, baseline_cd4 || null,
            residence_province || null, residence_district || null,
            residence_village || null, residence_ward || null,
            residence_gps_lat || null, residence_gps_lon || null,
            self_reported_travel_time_min || null, phone_available || null,
            phone_number || null, next_of_kin_name || null, next_of_kin_phone || null,
            marital_status || null, education_level || null,
            occupation || null, disclosure_status || null,
            req.params.id,
        ]);

        if (result.rows.length === 0)
            return res.status(404).json({ success: false, message: 'Patient not found' });

        res.json({ success: true, patient: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────
// 5. RUN AI RISK PREDICTION — single patient (button click)
//    POST /api/patients/:id/predict
// ─────────────────────────────────────────────────────────────────
router.post('/:id/predict', async (req, res) => {
    const { id } = req.params;
    try {
        const risk = await calculateRiskScore(id);

        // Persist result
        await query(`
            INSERT INTO risk_scores
              (patient_id, default_probability, predicted_default, risk_tier,
               threshold_used, threshold_source, warnings)
            VALUES ($1,$2,$3,$4,$5,$6,$7)
        `, [
            id, risk.probability, risk.predicted_default,
            risk.label.toLowerCase(), risk.threshold_used,
            risk.threshold_source, JSON.stringify(risk.warnings),
        ]);

        res.json({ success: true, patient_id: id, risk });
    } catch (err) {
        if (err.status === 404) return res.status(404).json({ success: false, message: err.message });
        if (err.code === 'ECONNREFUSED') return res.status(503).json({ success: false, message: 'ML service unavailable' });
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────
// 6. PREDICT ALL PATIENTS (Predict Risks button)
//    POST /api/patients/predict
// ─────────────────────────────────────────────────────────────────
router.post('/predict', async (req, res) => {
    try {
        const activePatients = await query(
            `SELECT patient_id FROM patients WHERE exit_status = 'active'`
        );
        const ids = activePatients.rows.map(r => r.patient_id);

        if (ids.length === 0)
            return res.json({ success: true, message: 'No active patients to score', updated: 0 });

        const { batchCalculateRisk } = require('../services/riskEngine');
        const { results, errors } = await batchCalculateRisk(ids);

        for (const r of results) {
            await query(`
                INSERT INTO risk_scores
                  (patient_id, default_probability, predicted_default, risk_tier,
                   threshold_used, threshold_source, warnings)
                VALUES ($1,$2,$3,$4,$5,$6,$7)
            `, [
                r.patient_id, r.probability, r.predicted_default,
                r.label.toLowerCase(), r.threshold_used,
                r.threshold_source, JSON.stringify(r.warnings),
            ]);
        }

        res.json({
            success: true,
            message: `ML risk analysis completed for ${results.length} patients`,
            updated: results.length,
            errors: errors.length,
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;