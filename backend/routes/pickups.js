const express = require('express');
const router = express.Router();
const db = require('../config/db');

/**
 * Helper: Auto-calculate next pickup date from pickup date + frequency
 */
const calculateNextPickupDate = (pickupDate, frequencyDays) => {
  const date = new Date(pickupDate);
  date.setDate(date.getDate() + parseInt(frequencyDays));
  return date.toISOString().split('T')[0]; // Returns YYYY-MM-DD
};

/**
 * POST /api/pickups/record
 * Record a medication pickup — auto-calculates next pickup date
 */
router.post('/record', async (req, res) => {
  try {
    const { patient_id, pickup_date, next_pickup_date, quantity_dispensed, clinic_number, nurse_number, dispensing_clinic, notes } = req.body;

    console.log('📅 Recording pickup - received data:', {
      patient_id, pickup_date, next_pickup_date, quantity_dispensed, notes
    });

    // Validate required fields
    if (!patient_id) return res.status(400).json({ success: false, message: 'patient_id is required' });
    if (!pickup_date) return res.status(400).json({ success: false, message: 'pickup_date is required' });

    // Check if patient exists and get their pickup frequency
    const patientCheck = await db.query(
      'SELECT patient_id, first_name, last_name, pickup_frequency FROM patients WHERE patient_id = $1',
      [patient_id]
    );

    if (patientCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }

    const patient = patientCheck.rows[0];
    console.log('✅ Found patient:', patient.first_name, patient.last_name);

    // AUTO-CALCULATE next pickup date from patient's frequency
    // If frontend sends next_pickup_date manually, use it, otherwise auto-calculate
    const frequency = patient.pickup_frequency || 30;
    const computed_next_pickup = next_pickup_date || calculateNextPickupDate(pickup_date, frequency);

    console.log(`📅 Pickup frequency: ${frequency} days`);
    console.log(`📅 Next pickup date: ${computed_next_pickup}`);

    // Calculate days supply
    const pickupDateObj = new Date(pickup_date);
    const nextPickupDateObj = new Date(computed_next_pickup);
    const days_supply = Math.ceil((nextPickupDateObj - pickupDateObj) / (1000 * 60 * 60 * 24));

    // Get treatment_id from patient_treatments
    let treatment_id = null;
    try {
      const treatmentCheck = await db.query(
        'SELECT treatment_id FROM patient_treatments WHERE patient_id = $1 AND is_current = true LIMIT 1',
        [patient_id]
      );

      if (treatmentCheck.rows.length > 0) {
        treatment_id = treatmentCheck.rows[0].treatment_id;
        console.log('✅ Found treatment_id:', treatment_id);
      } else {
        const anyTreatment = await db.query(
          'SELECT treatment_id FROM patient_treatments WHERE patient_id = $1 ORDER BY treatment_id DESC LIMIT 1',
          [patient_id]
        );
        if (anyTreatment.rows.length > 0) {
          treatment_id = anyTreatment.rows[0].treatment_id;
          console.log('✅ Using latest treatment_id:', treatment_id);
        }
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

    // Insert pickup record
    const insertQuery = `
      INSERT INTO medication_pickups (
        patient_id, treatment_id, scheduled_date, actual_pickup_date,
        next_pickup_date, quantity_dispensed, days_supply,
        clinic_number, nurse_number, dispensing_clinic, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;

    const values = [
      patient_id,
      treatment_id,
      pickup_date,
      pickup_date,
      computed_next_pickup,
      quantity_dispensed || 30,
      days_supply,
      clinic_number  || null,
      nurse_number   || null,
      dispensing_clinic || null,
      notes || null
    ];

    const result = await db.query(insertQuery, values);
    const pickup_record = result.rows[0];
    console.log('✅ Pickup recorded! ID:', pickup_record.pickup_id);

    // Update next_pickup_date on patients table
    try {
      await db.query(
        'UPDATE patients SET next_pickup_date = $1 WHERE patient_id = $2',
        [computed_next_pickup, patient_id]
      );
    } catch (e) {
      console.log('Could not update patient next_pickup_date:', e.message);
    }

    // Remove from defaulters if applicable
    try {
      await db.query(
        'UPDATE defaulters SET status = $1, resolved_date = CURRENT_TIMESTAMP WHERE patient_id = $2 AND status = $3',
        ['returned', patient_id, 'pending']
      );
    } catch (e) {
      console.log('ℹ️ Defaulters update skipped:', e.message);
    }

    res.json({
      success: true,
      message: 'Medication pickup recorded successfully',
      pickup: {
        pickup_id: pickup_record.pickup_id,
        patient_id: pickup_record.patient_id,
        pickup_date: pickup_record.actual_pickup_date,
        next_pickup_date: pickup_record.next_pickup_date,
        days_supply: pickup_record.days_supply,
        quantity_dispensed: pickup_record.quantity_dispensed,
        notes: pickup_record.notes
      },
      patient: {
        patient_id: patient.patient_id,
        first_name: patient.first_name,
        last_name: patient.last_name
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

/**
 * POST /api/pickups/set-first-pickup
 * Set the first pickup date manually for a new patient
 */
router.post('/set-first-pickup', async (req, res) => {
  try {
    const { patient_id, first_pickup_date } = req.body;

    if (!patient_id || !first_pickup_date) {
      return res.status(400).json({ 
        success: false, 
        message: 'patient_id and first_pickup_date are required' 
      });
    }

    // Check patient exists
    const patientCheck = await db.query(
      'SELECT patient_id, first_name, last_name FROM patients WHERE patient_id = $1',
      [patient_id]
    );

    if (patientCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }

    // Save first pickup date directly on the patient record
    await db.query(
      'UPDATE patients SET next_pickup_date = $1 WHERE patient_id = $2',
      [first_pickup_date, patient_id]
    );

    const patient = patientCheck.rows[0];
    console.log(`✅ First pickup date set for ${patient.first_name} ${patient.last_name}: ${first_pickup_date}`);

    res.json({
      success: true,
      message: `First pickup date set to ${first_pickup_date}`,
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

/**
 * GET /api/pickups/recent
 */
router.get('/recent', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const result = await db.query(`
      SELECT mp.pickup_id, mp.patient_id, mp.actual_pickup_date, mp.next_pickup_date,
             mp.days_supply, mp.quantity_dispensed, mp.notes, mp.created_at,
             p.first_name, p.last_name, p.patient_number
      FROM medication_pickups mp
      JOIN patients p ON mp.patient_id = p.patient_id
      ORDER BY mp.created_at DESC
      LIMIT $1
    `, [limit]);

    res.json({ success: true, count: result.rows.length, pickups: result.rows });
  } catch (error) {
    console.error('❌ Error fetching recent pickups:', error);
    res.status(500).json({ success: false, message: 'Error fetching recent pickups' });
  }
});

/**
 * GET /api/pickups/patient/:patient_id
 */
router.get('/patient/:patient_id', async (req, res) => {
  try {
    const { patient_id } = req.params;
    const result = await db.query(`
      SELECT mp.pickup_id, mp.actual_pickup_date, mp.next_pickup_date,
             mp.days_supply, mp.quantity_dispensed, mp.notes, mp.created_at,
             p.first_name, p.last_name, p.patient_number
      FROM medication_pickups mp
      JOIN patients p ON mp.patient_id = p.patient_id
      WHERE mp.patient_id = $1
      ORDER BY mp.actual_pickup_date DESC
    `, [patient_id]);

    res.json({ success: true, count: result.rows.length, pickups: result.rows });
  } catch (error) {
    console.error('❌ Error fetching patient pickup history:', error);
    res.status(500).json({ success: false, message: 'Error fetching pickup history' });
  }
});

/**
 * GET /api/pickups/upcoming
 */
router.get('/upcoming', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const result = await db.query(`
      SELECT DISTINCT ON (p.patient_id)
        p.patient_id, p.patient_number, p.first_name, p.last_name, p.phone_number,
        mp.next_pickup_date,
        mp.next_pickup_date - CURRENT_DATE as days_until
      FROM patients p
      JOIN medication_pickups mp ON p.patient_id = mp.patient_id
      WHERE mp.next_pickup_date BETWEEN CURRENT_DATE AND CURRENT_DATE + $1
      ORDER BY p.patient_id, mp.next_pickup_date DESC
    `, [days]);

    res.json({ success: true, count: result.rows.length, upcoming: result.rows });
  } catch (error) {
    console.error('❌ Error fetching upcoming pickups:', error);
    res.status(500).json({ success: false, message: 'Error fetching upcoming pickups' });
  }
});

module.exports = router;