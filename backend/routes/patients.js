const express = require('express');
const router = express.Router();
const { query, getClient } = require('../config/db');
const { verifyToken } = require('../middleware/auth');

router.use(verifyToken);

// ==========================================
// 1. 🔮 PREDICT RISK FOR ALL PATIENTS
// ==========================================
router.post('/predict', async (req, res) => {
    const activeWeatherAlerts = req.body.activeWeatherAlerts || [];
    
    const client = await getClient();
    try {
        await client.query('BEGIN');

        const result = await client.query(`
            SELECT patient_id, date_of_birth, distance_from_clinic, gender, district, ward, village, headman, chronic_diseases
            FROM patients WHERE is_active = true
        `);

        let updatedCount = 0;
        for (const patient of result.rows) {
            // ✅ FIX: Simplify history check to count past defaulter records
            const historyResult = await client.query(`
                SELECT COUNT(*) AS late_pickups 
                FROM defaulters 
                WHERE patient_id = $1
            `, [patient.patient_id]);

            const prediction = predictRisk(patient, historyResult.rows[0], activeWeatherAlerts);
            
            await client.query(`
                UPDATE patients SET risk_score=$1, risk_level=$2, risk_factors=$3 WHERE patient_id=$4
            `, [prediction.score, prediction.label, JSON.stringify(prediction.factors), patient.patient_id]);
            updatedCount++;
        }

        await client.query('COMMIT');
        res.json({ success: true, message: `Analyzed ${updatedCount} patients` });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Prediction error:", err);
        res.status(500).json({ success: false, message: 'Prediction failed' });
    } finally {
        client.release();
    }
});

// ==========================================
// 2. GET ALL PATIENTS
// ==========================================
router.get('/', async (req, res) => {
    try {
        const result = await query(`
            SELECT *, (first_name || ' ' || last_name) AS full_name
            FROM patients
            WHERE patient_id NOT IN (
                SELECT patient_id FROM defaulters WHERE status = 'pending'
            )
            ORDER BY risk_score DESC, last_name ASC
        `);
        const data = result.rows.map(p => ({ ...p, risk_factors: parseFactors(p.risk_factors) }));
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==========================================
// 3. CREATE PATIENT
// ==========================================
router.post('/', async (req, res) => {
    const {
        patient_number, first_name, last_name, date_of_birth, gender,
        phone_number, alternative_phone, email, district, ward, village, headman,
        distance_from_clinic, enrollment_date, arv_regimen,
        pickup_frequency, next_pickup_date, is_new_patient,
        emergency_contact_name, emergency_contact_phone,
        clinic_number, nurse_number, dispensing_clinic, chronic_diseases
    } = req.body;

    const userId = req.user?.id || req.user?.user_id || req.user?.userId || req.user?.sub || req.user?.ID || null;
    let createdByName = 'Unknown';

    if (userId) {
        try {
            const userResult = await query(`SELECT username, first_name, last_name FROM users WHERE user_id = $1`, [userId]);
            if (userResult.rows.length > 0) {
                const u = userResult.rows[0];
                createdByName = (u.first_name && u.last_name) ? `${u.first_name} ${u.last_name}` : u.username;
            }
        } catch (e) {
            console.error('User lookup failed:', e.message);
        }
    }

    try {
        const freq = parseInt(pickup_frequency) || 30;
        let finalPickupDate = null;

        if (is_new_patient === true || is_new_patient === 'true') {
            finalPickupDate = next_pickup_date || null;
        } else {
            const enrollDate = enrollment_date ? new Date(enrollment_date) : new Date();
            const calc = new Date(enrollDate);
            calc.setDate(calc.getDate() + freq);
            finalPickupDate = calc.toISOString().split('T')[0];
        }

        const result = await query(
            `INSERT INTO patients (
                patient_number, first_name, last_name, date_of_birth, gender,
                phone_number, alternative_phone, email, district, ward, village, headman,
                distance_from_clinic, enrollment_date, arv_regimen,
                pickup_frequency, next_pickup_date,
                emergency_contact_name, emergency_contact_phone,
                created_by, clinic_number, nurse_number, dispensing_clinic, chronic_diseases
            ) VALUES (
                $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
                $11,$12,$13,$14,$15,$16,$17,$18,$19,$20, $21,$22,$23, $24
            ) RETURNING *`,
            [
                patient_number || `P-${Date.now()}`, first_name, last_name, date_of_birth, gender,
                phone_number, alternative_phone || null, email || null, district || null, ward || null, 
                village || null, headman || null, distance_from_clinic || 0, enrollment_date, arv_regimen || null,
                freq, finalPickupDate, emergency_contact_name || null, emergency_contact_phone || null,
                createdByName,
                clinic_number || null, nurse_number || null, dispensing_clinic || null, chronic_diseases || null
            ]
        );

        const newPatient = result.rows[0];

        // Fallback-protected treatment creation
        if (arv_regimen) {
            try {
                await query(
                    `INSERT INTO patient_treatments (patient_id, arv_regimen, start_date, is_current)
                     VALUES ($1, $2, CURRENT_DATE, true)`,
                    [newPatient.patient_id, arv_regimen]
                );
            } catch (treatmentErr) {
                try {
                    await query(
                        `INSERT INTO patient_treatments (patient_id, start_date, is_current)
                         VALUES ($1, CURRENT_DATE, true)`,
                        [newPatient.patient_id]
                    );
                } catch(e) {
                    console.error('⚠️ Could not auto-create treatment record entirely:', e.message);
                }
            }
        }

        res.json({ success: true, patient: newPatient });
    } catch (err) {
        console.error('Create patient error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==========================================
// 4. GET SINGLE PATIENT
// ==========================================
router.get('/:id', async (req, res) => {
    try {
        const result = await query('SELECT * FROM patients WHERE patient_id = $1', [req.params.id]);
        if (result.rows.length === 0)
            return res.status(404).json({ success: false, message: 'Patient not found' });
        res.json({ success: true, patient: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==========================================
// 5. UPDATE PATIENT
// ==========================================
router.put('/:id', async (req, res) => {
    const {
        first_name, last_name, date_of_birth, gender, phone_number,
        alternative_phone, email, district, ward, village, headman, distance_from_clinic,
        arv_regimen, emergency_contact_name, emergency_contact_phone,
        next_pickup_date, pickup_frequency, clinic_number, nurse_number, dispensing_clinic,
        chronic_diseases
    } = req.body;

    try {
        const result = await query(
            `UPDATE patients SET
                first_name=$1, last_name=$2, date_of_birth=$3, gender=$4,
                phone_number=$5, alternative_phone=$6, email=$7,
                district=$8, ward=$9, village=$10, headman=$11, distance_from_clinic=$12,
                arv_regimen=$13, emergency_contact_name=$14,
                emergency_contact_phone=$15, next_pickup_date=$16,
                pickup_frequency=$17, clinic_number=$18, nurse_number=$19, dispensing_clinic=$20,
                chronic_diseases=$21
             WHERE patient_id=$22 RETURNING *`,
            [
                first_name, last_name, date_of_birth, gender, phone_number, alternative_phone || null,
                email || null, district || null, ward || null, village || null, headman || null, distance_from_clinic,
                arv_regimen || null, emergency_contact_name || null, emergency_contact_phone || null,
                next_pickup_date || null, pickup_frequency || 30,
                clinic_number || null, nurse_number || null, dispensing_clinic || null,
                chronic_diseases || null,
                req.params.id
            ]
        );

        res.json({ success: true, patient: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==========================================
// 🧠 PREDICTIVE LOGIC
// ==========================================
const predictRisk = (patient, history, activeWeatherAlerts = []) => {
    let score = 0, factors = [];
    const distance = isNaN(parseFloat(patient.distance_from_clinic)) ? 0 : parseFloat(patient.distance_from_clinic);
    const age = getAge(patient.date_of_birth);
    const latePickups = parseInt(history.late_pickups) || 0;

    if (latePickups > 2)        { score += 40; factors.push("Chronic Defaulter (Late 3+ times)"); }
    else if (latePickups === 2) { score += 25; factors.push("History of late pickups (2 times)"); }
    else if (latePickups === 1) { score += 10; factors.push("Previous Default Record"); }

    if (distance > 25)      { score += 30; factors.push("Extreme Distance (>25km)"); }
    else if (distance > 15) { score += 15; factors.push("Long Distance (>15km)"); }

    if (age >= 18 && age <= 24) { score += 20; factors.push("High-Risk Age Group (18-24)"); }
    else if (age > 70)          { score += 10; factors.push("Geriatric Vulnerability"); }

    if (patient.chronic_diseases && patient.chronic_diseases.trim() !== '') {
        score += 15; 
        factors.push(`Comorbidities Present (${patient.chronic_diseases})`);
    }

    const patientLocation = `${patient.district || ''} ${patient.ward || ''} ${patient.village || ''} ${patient.headman || ''}`.toLowerCase();
    const isAffectedByWeather = activeWeatherAlerts.some(
        alertLocation => patientLocation.includes(alertLocation.toLowerCase())
    );

    if (isAffectedByWeather) {
        score += 15; 
        factors.push("Active Weather/Disaster Alert in Area");
    }

    score = Math.min(score, 100);
    let label = score >= 50 ? 'High' : score >= 25 ? 'Medium' : 'Low';
    return { score, label, factors };
};

const getAge = (dob) => {
    if (!dob) return 30;
    const d = new Date(dob);
    return isNaN(d.getTime()) ? 30 : new Date().getFullYear() - d.getFullYear();
};

const parseFactors = (factors) => {
    try {
        if (!factors) return [];
        return typeof factors === 'string' ? JSON.parse(factors) : factors;
    } catch (e) { return []; }
};

module.exports = router;