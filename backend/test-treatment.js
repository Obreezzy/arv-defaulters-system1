// Assign ARV treatment to patients

const { query } = require('./config/db');

const assignTreatments = async () => {
    try {
        console.log('💊 Assigning treatments to patients...\n');

        // Get all patients
        const patients = await query('SELECT patient_id, first_name, last_name FROM patients');

        if (patients.rows.length === 0) {
            console.log('❌ No patients found. Run test-patient.js first');
            process.exit(1);
        }

        // Get ARV regimen (we inserted these in schema)
        const regimen = await query('SELECT regimen_id FROM arv_regimens LIMIT 1');

        if (regimen.rows.length === 0) {
            console.log('❌ No regimens found');
            process.exit(1);
        }

        const regimenId = regimen.rows[0].regimen_id;

        // Assign treatment to each patient
        for (const patient of patients.rows) {
            const result = await query(
                `INSERT INTO patient_treatments (
                    patient_id, regimen_id, start_date, pickup_frequency_days, is_current, created_by
                ) VALUES ($1, $2, CURRENT_DATE, 30, true, 1)
                RETURNING treatment_id`,
                [patient.patient_id, regimenId]
            );

            console.log(`✅ ${patient.first_name} ${patient.last_name} - Treatment ID: ${result.rows[0].treatment_id}`);
        }

        console.log('\n✅ All patients now have treatments assigned!');
        console.log('💡 Next: Run test-pickup.js to record medication pickups\n');

        process.exit(0);

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
};

assignTreatments();