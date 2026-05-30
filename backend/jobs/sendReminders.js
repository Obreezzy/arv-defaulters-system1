// backend/jobs/sendReminders.js
// Automated job to send SMS reminders before pickup date

const { query } = require('../config/db');
const smsService = require('../services/sms');

const sendRemindersJob = async (daysAhead = 1) => {
    try {
        console.log('\n========================================');
        console.log(`AUTOMATED JOB: Send ${daysAhead}-Day Reminders`);
        console.log('Started:', new Date().toISOString());
        console.log('========================================\n');

        // Find patients whose next pickup is exactly daysAhead days from now
        // Uses visits table (new schema) — latest visit per patient
        const patients = await query(
            `SELECT DISTINCT ON (p.patient_id)
                p.patient_id,
                p.first_name,
                p.last_name,
                p.phone_number,
                p.phone_available,
                v.scheduled_next_appt_date AS next_pickup_date,
                f.facility_name
             FROM patients p
             JOIN visits v ON v.patient_id = p.patient_id
             JOIN facilities f ON f.facility_id = p.facility_id
             WHERE v.scheduled_next_appt_date = CURRENT_DATE + ($1 * INTERVAL '1 day')
               AND p.exit_status = 'active'
               AND p.phone_number IS NOT NULL
               AND p.phone_available = 'Yes'
             ORDER BY p.patient_id, v.visit_date DESC`,
            [daysAhead]
        );

        if (patients.rows.length === 0) {
            console.log(`No patients with pickups in ${daysAhead} day(s)`);
            console.log('========================================\n');
            return { success: true, sent: 0 };
        }

        console.log(`Found ${patients.rows.length} patients to remind\n`);
        patients.rows.forEach((p, i) => {
            const name = p.first_name ? `${p.first_name} ${p.last_name}` : p.patient_id;
            console.log(`  ${i + 1}. ${name} (${p.patient_id}) → ${p.phone_number} | Pickup: ${p.next_pickup_date}`);
        });

        // Build SMS batch
        const recipients = patients.rows.map(patient => {
            const name = patient.first_name || patient.patient_id;
            const pickupDate = convertToDisplayDate(patient.next_pickup_date);
            return {
                phoneNumber: patient.phone_number,
                message: `Hello ${name}, this is a gentle reminder .Your pickup is due on ${pickupDate}. Please collect on time.Take care!`,
                patientId: patient.patient_id
            };
        });

        const result = await smsService.sendBulkSMS(recipients);

        console.log(`\nReminders sent: ${result.successful}/${result.total}`);
        if (result.failed > 0) console.log(`Failed: ${result.failed}`);

        result.results?.forEach(r => {
            if (r.success) {
                console.log(`   Sent to ${r.patientId} → SID: ${r.messageSid}`);
            } else {
                console.log(`   Failed for ${r.patientId} → ${r.error}`);
            }
        });

        console.log('\n========================================');
        console.log('Job completed');
        console.log('Ended:', new Date().toISOString());
        console.log('========================================\n');

        return {
            success: true,
            total: result.total,
            sent: result.successful,
            failed: result.failed
        };

    } catch (error) {
        console.error('sendReminders job failed:', error.message);
        return { success: false, error: error.message };
    }
};

const convertToDisplayDate = (yyyymmdd) => {
    if (!yyyymmdd) return '';
    const date = new Date(yyyymmdd);
    const day   = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year  = date.getFullYear();
    return `${day}-${month}-${year}`;
};

module.exports = sendRemindersJob;