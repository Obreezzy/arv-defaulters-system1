const express = require('express');
const router  = express.Router();
const db      = require('../config/db');

// ============================================
// HELPER: Calculate next pickup date
// ============================================
const calculateNextPickupDate = (pickupDate, frequencyDays) => {
  const date = new Date(pickupDate);
  date.setDate(date.getDate() + parseInt(frequencyDays));
  return date.toISOString().split('T')[0];
};

// ============================================
// HELPER: Age from date of birth
// ============================================
const getAge = (dob) => {
  if (!dob) return 30;
  const d = new Date(dob);
  return isNaN(d.getTime()) ? 30 : new Date().getFullYear() - d.getFullYear();
};

// ============================================
// HELPER: Predict risk for a single patient
// ============================================
const predictRiskForPatient = (patient, history) => {
  let score   = 0;
  let factors = [];

  const distance    = isNaN(parseFloat(patient.distance_from_clinic))
    ? 0 : parseFloat(patient.distance_from_clinic);
  const age         = getAge(patient.date_of_birth);
  const latePickups = parseInt(history.late_pickups) || 0;

  if (latePickups > 2) {
    score += 40; factors.push('Chronic Defaulter (Late 3+ times)');
  } else if (latePickups === 2) {
    score += 25; factors.push('History of late pickups (2 times)');
  } else if (latePickups === 1) {
    score += 10; factors.push('First-time late pickup');
  }

  if (distance > 25)      { score += 30; factors.push('Extreme Distance (>25km)'); }
  else if (distance > 15) { score += 15; factors.push('Long Distance (>15km)'); }

  if (age >= 18 && age <= 24) { score += 20; factors.push('High-Risk Age Group (18-24)'); }
  else if (age > 70)          { score += 10; factors.push('Geriatric Vulnerability'); }

  score = Math.min(score, 100);
  const label = score >= 50 ? 'High' : score >= 25 ? 'Medium' : 'Low';
  return { score, label, factors };
};

// ============================================
// HELPER: Recalculate and save risk for one patient
// ============================================
const recalculatePatientRisk = async (patient_id) => {
  try {
    const patientRes = await db.query(
      `SELECT patient_id, date_of_birth, distance_from_clinic
       FROM patients WHERE patient_id = $1`,
      [patient_id]
    );
    if (patientRes.rows.length === 0) return;
    const patient = patientRes.rows[0];

    const historyRes = await db.query(
      `SELECT
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
       ) sub`,
      [patient_id]
    );

    const history    = historyRes.rows[0];
    const prediction = predictRiskForPatient(patient, history);

    await db.query(
      `UPDATE patients
       SET risk_score = $1, risk_level = $2, risk_factors = $3
       WHERE patient_id = $4`,
      [prediction.score, prediction.label, JSON.stringify(prediction.factors), patient_id]
    );

    console.log(
      '🔮 Risk recalculated | Patient:', patient_id,
      '| Score:', prediction.score + '%',
      '| Level:', prediction.label,
      '| Late pickups:', history.late_pickups
    );
  } catch (err) {
    console.error('⚠️ Risk recalculation failed (non-fatal):', err.message);
  }
};

// ============================================
// POST /api/pickups/record
// ============================================
router.post('/record', async (req, res) => {
  try {
    const {
      patient_id, pickup_date, next_pickup_date,
      quantity_dispensed, clinic_number, nurse_number,
      dispensing_clinic, notes
    } = req.body;

    console.log('📅 Recording pickup:', { patient_id, pickup_date, nurse_number });

    if (!patient_id) return res.status(400).json({ success: false, message: 'patient_id is required' });
    if (!pickup_date) return res.status(400).json({ success: false, message: 'pickup_date is required' });

    // ── Get patient ──
    const patientCheck = await db.query(
      `SELECT patient_id, first_name, last_name, pickup_frequency
       FROM patients WHERE patient_id = $1`,
      [patient_id]
    );
    if (patientCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }

    const patient              = patientCheck.rows[0];
    const frequency            = patient.pickup_frequency || 30;
    const computed_next_pickup = next_pickup_date || calculateNextPickupDate(pickup_date, frequency);
    const days_supply          = Math.ceil(
      (new Date(computed_next_pickup) - new Date(pickup_date)) / (1000 * 60 * 60 * 24)
    );

    console.log('✅ Patient:', patient.first_name, patient.last_name);
    console.log('📅 Next pickup:', computed_next_pickup, '| Days supply:', days_supply);

    // ── Get treatment_id ──
    let treatment_id = null;
    try {
      const t1 = await db.query(
        'SELECT treatment_id FROM patient_treatments WHERE patient_id = $1 AND is_current = true LIMIT 1',
        [patient_id]
      );
      if (t1.rows.length > 0) {
        treatment_id = t1.rows[0].treatment_id;
      } else {
        const t2 = await db.query(
          'SELECT treatment_id FROM patient_treatments WHERE patient_id = $1 ORDER BY treatment_id DESC LIMIT 1',
          [patient_id]
        );
        if (t2.rows.length > 0) treatment_id = t2.rows[0].treatment_id;
      }
    } catch (e) {
      console.log('⚠️ Could not find treatment:', e.message);
    }

    if (!treatment_id) {
      return res.status(400).json({
        success: false,
        message: 'No treatment record found for this patient. Please assign a treatment first.'
      });
    }

    // ── Insert pickup ──
    // dispensed_by = nurse_number string directly (e.g. NRS-005)
    // no separate nurse_number column — dispensed_by IS the nurse identifier
    const result = await db.query(
      `INSERT INTO medication_pickups (
          patient_id,
          treatment_id,
          pickup_date,
          actual_pickup_date,
          scheduled_date,
          next_pickup_date,
          quantity_dispensed,
          days_supply,
          dispensed_by,
          clinic_number,
          dispensing_clinic,
          notes
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        patient_id,
        treatment_id,
        pickup_date,              // pickup_date
        pickup_date,              // actual_pickup_date (kept in sync)
        pickup_date,              // scheduled_date
        computed_next_pickup,     // next_pickup_date
        quantity_dispensed || 30, // quantity_dispensed
        days_supply,              // days_supply
        nurse_number || null,     // dispensed_by = nurse number string e.g. NRS-005
        clinic_number    || null, // clinic_number
        dispensing_clinic || null,// dispensing_clinic
        notes            || null  // notes
      ]
    );

    const pickup_record = result.rows[0];
    console.log('✅ Pickup recorded! ID:', pickup_record.pickup_id,
      '| Dispensed by:', nurse_number);

    // ── Update next_pickup_date on patient ──
    try {
      await db.query(
        'UPDATE patients SET next_pickup_date = $1 WHERE patient_id = $2',
        [computed_next_pickup, patient_id]
      );
    } catch (e) {
      console.log('Could not update patient next_pickup_date:', e.message);
    }

    // ── Remove from defaulters if applicable ──
    try {
      await db.query(
        `UPDATE defaulters SET status = 'returned', resolved_date = CURRENT_TIMESTAMP
         WHERE patient_id = $1 AND status = 'pending'`,
        [patient_id]
      );
    } catch (e) {
      console.log('ℹ️ Defaulters update skipped:', e.message);
    }

    // ── Recalculate risk score (Option A) ──
    await recalculatePatientRisk(patient_id);

    res.json({
      success: true,
      message: 'Medication pickup recorded successfully. Risk score updated.',
      pickup: {
        pickup_id:          pickup_record.pickup_id,
        patient_name:       patient.first_name + ' ' + patient.last_name,
        pickup_date:        pickup_record.pickup_date,
        next_pickup_date:   pickup_record.next_pickup_date,
        days_supply:        pickup_record.days_supply,
        quantity_dispensed: pickup_record.quantity_dispensed,
        dispensed_by:       nurse_number || null,
        clinic_number:      clinic_number || null,
        dispensing_clinic:  dispensing_clinic || null,
        notes:              pickup_record.notes
      },
      patient: {
        patient_id: patient.patient_id,
        first_name: patient.first_name,
        last_name:  patient.last_name
      }
    });

  } catch (error) {
    console.error('❌ Error recording pickup:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error while recording pickup',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// ============================================
// POST /api/pickups/set-first-pickup
// ============================================
router.post('/set-first-pickup', async (req, res) => {
  try {
    const { patient_id, first_pickup_date } = req.body;

    if (!patient_id || !first_pickup_date) {
      return res.status(400).json({
        success: false,
        message: 'patient_id and first_pickup_date are required'
      });
    }

    const patientCheck = await db.query(
      'SELECT patient_id, first_name, last_name FROM patients WHERE patient_id = $1',
      [patient_id]
    );
    if (patientCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }

    await db.query(
      'UPDATE patients SET next_pickup_date = $1 WHERE patient_id = $2',
      [first_pickup_date, patient_id]
    );

    const patient = patientCheck.rows[0];
    console.log('✅ First pickup date set for',
      patient.first_name, patient.last_name, ':', first_pickup_date);

    res.json({
      success: true,
      message: 'First pickup date set to ' + first_pickup_date,
      patient_id,
      first_pickup_date
    });
  } catch (error) {
    console.error('❌ Error setting first pickup date:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error while setting first pickup date'
    });
  }
});

// ============================================
// GET /api/pickups/recent
// ============================================
router.get('/recent', async (req, res) => {
  try {
    const limit  = parseInt(req.query.limit) || 20;
    const result = await db.query(
      `SELECT
          mp.pickup_id,
          mp.patient_id,
          mp.pickup_date,
          mp.actual_pickup_date,
          mp.next_pickup_date,
          mp.days_supply,
          mp.quantity_dispensed,
          mp.dispensed_by,
          mp.clinic_number,
          mp.dispensing_clinic,
          mp.notes,
          mp.created_at,
          p.first_name,
          p.last_name,
          p.patient_number
       FROM medication_pickups mp
       JOIN patients p ON mp.patient_id = p.patient_id
       ORDER BY mp.created_at DESC
       LIMIT $1`,
      [limit]
    );
    res.json({ success: true, count: result.rows.length, pickups: result.rows });
  } catch (error) {
    console.error('❌ Error fetching recent pickups:', error);
    res.status(500).json({ success: false, message: 'Error fetching recent pickups' });
  }
});

// ============================================
// GET /api/pickups/patient/:patient_id
// ============================================
router.get('/patient/:patient_id', async (req, res) => {
  try {
    const { patient_id } = req.params;
    const result = await db.query(
      `SELECT
          mp.pickup_id,
          mp.pickup_date,
          mp.actual_pickup_date,
          mp.next_pickup_date,
          mp.days_supply,
          mp.quantity_dispensed,
          mp.dispensed_by,
          mp.clinic_number,
          mp.dispensing_clinic,
          mp.notes,
          mp.created_at,
          p.first_name,
          p.last_name,
          p.patient_number
       FROM medication_pickups mp
       JOIN patients p ON mp.patient_id = p.patient_id
       WHERE mp.patient_id = $1
       ORDER BY mp.actual_pickup_date DESC`,
      [patient_id]
    );
    res.json({ success: true, count: result.rows.length, pickups: result.rows });
  } catch (error) {
    console.error('❌ Error fetching patient pickup history:', error);
    res.status(500).json({ success: false, message: 'Error fetching pickup history' });
  }
});

// ============================================
// GET /api/pickups/upcoming
// ============================================
router.get('/upcoming', async (req, res) => {
  try {
    const days   = parseInt(req.query.days) || 7;
    const result = await db.query(
      `SELECT DISTINCT ON (p.patient_id)
          p.patient_id, p.patient_number, p.first_name, p.last_name, p.phone_number,
          mp.next_pickup_date,
          mp.next_pickup_date - CURRENT_DATE AS days_until
       FROM patients p
       JOIN medication_pickups mp ON p.patient_id = mp.patient_id
       WHERE mp.next_pickup_date BETWEEN CURRENT_DATE AND CURRENT_DATE + $1
       ORDER BY p.patient_id, mp.next_pickup_date DESC`,
      [days]
    );
    res.json({ success: true, count: result.rows.length, upcoming: result.rows });
  } catch (error) {
    console.error('❌ Error fetching upcoming pickups:', error);
    res.status(500).json({ success: false, message: 'Error fetching upcoming pickups' });
  }
});

module.exports = router;