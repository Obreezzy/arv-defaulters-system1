const express = require('express');
const router = express.Router();
const { query, getClient } = require('../config/db');
const { verifyToken } = require('../middleware/auth');

router.use(verifyToken);

// ==========================================
// 1. 🔮 PREDICT RISK FOR ALL PATIENTS
// ==========================================
router.post('/predict', async (req, res) => {
    // Catch the active weather alerts sent from the React frontend
    const activeWeatherAlerts = req.body.activeWeatherAlerts || [];
    
    const client = await getClient();
    try {
        await client.query('BEGIN');

        // Added 'city' to the SELECT statement so we can check weather locations
        const result = await client.query(`
            SELECT patient_id, date_of_birth, distance_from_clinic, gender, address, city
            FROM patients WHERE is_active = true
        `);

        let updatedCount = 0;
        for (const patient of result.rows) {
            const historyResult = await client.query(`
                SELECT
                    COUNT(*) AS total_pickups,
                    COUNT(*) FILTER (
                        WHERE actual_pickup_date > prev_scheduled
                        AND prev_scheduled IS NOT NULL
                    ) AS late_pickups
                FROM (
                    SELECT
                        actual_pickup_date,
                        LAG(next_pickup_date) OVER (ORDER BY actual_pickup_date) AS prev_scheduled
                    FROM medication_pickups
                    WHERE patient_id = $1
                ) sub
            `, [patient.patient_id]);

            // Pass the active alerts into the prediction engine
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
// 2. GET ALL PATIENTS (excludes active defaulters)
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
        phone_number, alternative_phone, email, address, city,
        distance_from_clinic, enrollment_date, arv_regimen,
        pickup_frequency, next_pickup_date, is_new_patient,
        emergency_contact_name, emergency_contact_phone
    } = req.body;

    const userId =
        req.user?.id        ||
        req.user?.user_id   ||
        req.user?.userId    ||
        req.user?.sub       ||
        req.user?.ID        ||
        null;

    let createdByName = 'Unknown';

    if (userId) {
        try {
            const userResult = await query(
                `SELECT username, first_name, last_name FROM users WHERE user_id = $1`,
                [userId]
            );
            if (userResult.rows.length > 0) {
                const u = userResult.rows[0];
                createdByName = (u.first_name && u.last_name)
                    ? `${u.first_name} ${u.last_name}`
                    : u.username;
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
                phone_number, alternative_phone, email, address, city,
                distance_from_clinic, enrollment_date, arv_regimen,
                pickup_frequency, next_pickup_date,
                emergency_contact_name, emergency_contact_phone,
                created_by
            ) VALUES (
                $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
                $11,$12,$13,$14,$15,$16,$17,$18
            ) RETURNING *`,
            [
                patient_number || `P-${Date.now()}`,
                first_name, last_name, date_of_birth, gender,
                phone_number,
                alternative_phone    || null,
                email                || null,
                address              || null,
                city                 || null,
                distance_from_clinic || 0,
                enrollment_date,
                arv_regimen          || null,
                freq,
                finalPickupDate,
                emergency_contact_name  || null,
                emergency_contact_phone || null,
                createdByName
            ]
        );

        res.json({ success: true, patient: result.rows[0] });
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
        alternative_phone, email, address, city, distance_from_clinic,
        arv_regimen, emergency_contact_name, emergency_contact_phone,
        next_pickup_date, pickup_frequency
    } = req.body;

    try {
        const result = await query(
            `UPDATE patients SET
                first_name=$1, last_name=$2, date_of_birth=$3, gender=$4,
                phone_number=$5, alternative_phone=$6, email=$7,
                address=$8, city=$9, distance_from_clinic=$10,
                arv_regimen=$11, emergency_contact_name=$12,
                emergency_contact_phone=$13, next_pickup_date=$14,
                pickup_frequency=$15
             WHERE patient_id=$16 RETURNING *`,
            [
                first_name, last_name, date_of_birth, gender, phone_number,
                alternative_phone    || null,
                email                || null,
                address              || null,
                city                 || null,
                distance_from_clinic,
                arv_regimen          || null,
                emergency_contact_name  || null,
                emergency_contact_phone || null,
                next_pickup_date     || null,
                pickup_frequency     || 30,
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
// Added activeWeatherAlerts as a parameter
const predictRisk = (patient, history, activeWeatherAlerts = []) => {
    let score = 0, factors = [];
    const distance = isNaN(parseFloat(patient.distance_from_clinic)) ? 0 : parseFloat(patient.distance_from_clinic);
    const age = getAge(patient.date_of_birth);
    const latePickups = parseInt(history.late_pickups) || 0;

    if (latePickups > 2)        { score += 40; factors.push("Chronic Defaulter (Late 3+ times)"); }
    else if (latePickups === 2) { score += 25; factors.push("History of late pickups (2 times)"); }
    else if (latePickups === 1) { score += 10; factors.push("First-time late pickup"); }

    if (distance > 25)      { score += 30; factors.push("Extreme Distance (>25km)"); }
    else if (distance > 15) { score += 15; factors.push("Long Distance (>15km)"); }

    if (age >= 18 && age <= 24) { score += 20; factors.push("High-Risk Age Group (18-24)"); }
    else if (age > 70)          { score += 10; factors.push("Geriatric Vulnerability"); }

    // --- WEATHER ALERT BOOST LOGIC ---
    // Safely check city or address, falling back to empty string
    const patientLocation = (patient.city || patient.address || "").toLowerCase();
    
    const isAffectedByWeather = activeWeatherAlerts.some(
        alertLocation => patientLocation.includes(alertLocation.toLowerCase())
    );

    if (isAffectedByWeather) {
        score += 15; // You can change this penalty weight if you want
        factors.push("Active Weather/Disaster Alert in Area");
    }
    // ---------------------------------

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