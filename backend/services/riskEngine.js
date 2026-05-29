/**
 * riskEngine.js
 * -------------
 * Calls the Flask arv_inference ML API.
 * Fetches all required data from Neon and assembles the correct payload.
 *
 * Drop this file into: backend/services/riskEngine.js
 * (replaces the old version completely)
 */

const axios = require('axios');
const { query } = require('../config/db');

const ML_API_URL = process.env.ML_API_URL || 'http://localhost:5000';

// ─────────────────────────────────────────────────────────────────
// HEALTH CHECK — called on server startup (server.js already does this)
// ─────────────────────────────────────────────────────────────────
const checkMLHealth = async () => {
    try {
        const res = await axios.get(`${ML_API_URL}/health`, { timeout: 10000 });
        console.log(`[ML] Risk Engine online — ${res.data.model}`);
        return true;
    } catch (err) {
        console.error('[ML] Risk Engine offline. Start Flask: cd ml_api && python app.py');
        return false;
    }
};

// ─────────────────────────────────────────────────────────────────
// FETCH — pull everything needed for one patient from Neon
// ─────────────────────────────────────────────────────────────────
const fetchPatientData = async (patientId) => {

    // 1. Patient row
    const patResult = await query(
        `SELECT patient_id, facility_id, sex, date_of_birth, art_start_date,
                hiv_diagnosis_date, who_stage_at_enrolment, baseline_cd4,
                residence_province, residence_district, residence_village,
                residence_ward, residence_gps_lat, residence_gps_lon,
                self_reported_travel_time_min, phone_available,
                marital_status, education_level, occupation,
                disclosure_status, exit_status, exit_date
         FROM patients WHERE patient_id = $1`,
        [patientId]
    );
    if (patResult.rows.length === 0) {
        const e = new Error(`Patient not found: ${patientId}`);
        e.status = 404;
        throw e;
    }
    const patient = patResult.rows[0];

    // 2. Facility row
    const facResult = await query(
        `SELECT facility_id, facility_name, facility_type, province, district,
                gps_lat, gps_lon, catchment_type
         FROM facilities WHERE facility_id = $1`,
        [patient.facility_id]
    );
    const facility = facResult.rows[0] || {};

    // 3. All visits — ordered oldest first (required by arv_inference)
    const visResult = await query(
        `SELECT visit_id, patient_id, visit_date, days_dispensed,
                scheduled_next_appt_date, regimen, dsd_model,
                viral_load_result, viral_load_date,
                weight_kg, height_cm, tb_screen_result,
                pregnancy_status, functional_status
         FROM visits
         WHERE patient_id = $1
         ORDER BY visit_date ASC`,
        [patientId]
    );
    const visits = visResult.rows;

    if (visits.length === 0) {
        const e = new Error(`No visits found for patient: ${patientId}`);
        e.status = 422;
        throw e;
    }

    // 4. Stockout months for this facility
    const stkResult = await query(
        `SELECT year_month FROM facility_stockouts
         WHERE facility_id = $1 AND stockout_flag = 1`,
        [patient.facility_id]
    );
    const stockout_months = stkResult.rows.map(r => r.year_month);

    // Format dates as ISO strings (Postgres returns Date objects)
    const fmtDate = (d) => d ? new Date(d).toISOString().split('T')[0] : null;

    return {
        patient: {
            patient_id:                    patient.patient_id,
            facility_id:                   patient.facility_id,
            sex:                           patient.sex,
            date_of_birth:                 fmtDate(patient.date_of_birth),
            art_start_date:                fmtDate(patient.art_start_date),
            hiv_diagnosis_date:            fmtDate(patient.hiv_diagnosis_date),
            who_stage_at_enrolment:        patient.who_stage_at_enrolment,
            baseline_cd4:                  patient.baseline_cd4,
            residence_province:            patient.residence_province,
            residence_district:            patient.residence_district,
            residence_village:             patient.residence_village,
            residence_ward:                patient.residence_ward,
            residence_gps_lat:             patient.residence_gps_lat,
            residence_gps_lon:             patient.residence_gps_lon,
            self_reported_travel_time_min: patient.self_reported_travel_time_min,
            phone_available:               patient.phone_available,
            marital_status:                patient.marital_status,
            education_level:               patient.education_level,
            occupation:                    patient.occupation,
            disclosure_status:             patient.disclosure_status,
            exit_status:                   patient.exit_status,
            exit_date:                     fmtDate(patient.exit_date),
        },
        facility: {
            facility_id:    facility.facility_id,
            facility_name:  facility.facility_name,
            facility_type:  facility.facility_type,
            province:       facility.province,
            district:       facility.district,
            gps_lat:        facility.gps_lat,
            gps_lon:        facility.gps_lon,
            catchment_type: facility.catchment_type,
        },
        visits: visits.map(v => ({
            visit_id:                 v.visit_id,
            patient_id:               v.patient_id,
            visit_date:               fmtDate(v.visit_date),
            days_dispensed:           v.days_dispensed,
            scheduled_next_appt_date: fmtDate(v.scheduled_next_appt_date),
            regimen:                  v.regimen,
            dsd_model:                v.dsd_model,
            viral_load_result:        v.viral_load_result,
            viral_load_date:          fmtDate(v.viral_load_date),
            weight_kg:                v.weight_kg,
            height_cm:                v.height_cm,
            tb_screen_result:         v.tb_screen_result,
            pregnancy_status:         v.pregnancy_status,
            functional_status:        v.functional_status,
        })),
        stockout_months,
        index: -1,   // always predict on the latest visit
    };
};

// ─────────────────────────────────────────────────────────────────
// MAIN: calculateRiskScore — single patient
// Called by your routes when the frontend button is clicked
// ─────────────────────────────────────────────────────────────────
const calculateRiskScore = async (patientId) => {
    const payload = await fetchPatientData(patientId);

    const response = await axios.post(
        `${ML_API_URL}/predict`,
        payload,
        { timeout: 30000, headers: { 'Content-Type': 'application/json' } }
    );

    const r = response.data;

    // Map arv_inference risk_tier to your existing label format (capitalised)
    const tierMap = { high: 'High', medium: 'Medium', low: 'Low' };

    return {
        score:             Math.round(r.default_probability * 100),  // 0-100
        label:             tierMap[r.risk_tier] || 'Low',
        probability:       r.default_probability,
        predicted_default: r.predicted_default,
        threshold_used:    r.threshold_used,
        threshold_source:  r.threshold_source,
        warnings:          r.warnings || [],
    };
};

// ─────────────────────────────────────────────────────────────────
// BATCH: score multiple patients (for dashboard / scheduler)
// ─────────────────────────────────────────────────────────────────
const batchCalculateRisk = async (patientIds) => {
    const results = [];
    const errors  = [];

    // Fetch all payloads (chunked to avoid DB overload)
    const CHUNK = 10;
    for (let i = 0; i < patientIds.length; i += CHUNK) {
        const chunk = patientIds.slice(i, i + CHUNK);
        await Promise.allSettled(
            chunk.map(async (pid) => {
                try {
                    const score = await calculateRiskScore(pid);
                    results.push({ patient_id: pid, ...score });
                } catch (err) {
                    errors.push({ patient_id: pid, error: err.message });
                }
            })
        );
    }

    return { results, errors };
};

module.exports = { calculateRiskScore, batchCalculateRisk, checkMLHealth };