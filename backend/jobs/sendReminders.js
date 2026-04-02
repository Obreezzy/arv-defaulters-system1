// backend/jobs/sendReminders.js
// Automated job to send SMS reminders

const { query } = require('../config/db');
const smsService = require('../services/sms');

const sendRemindersJob = async (daysAhead = 3) => {
    try {
        console.log('\n========================================');
        console.log(`AUTOMATED JOB: Send ${daysAhead}-Day Reminders`);
        console.log('Started:', new Date().toISOString());
        console.log('========================================\n');

        // Get patients with upcoming pickups
        const patients = await query(
            `SELECT DISTINCT ON (p.patient_id)
                p.patient_id, p.patient_number, p.first_name, p.last_name,
                p.phone_number, mp.next_pickup_date
             FROM patients p
             JOIN medication_pickups mp ON p.patient_id = mp.patient_id
             WHERE mp.next_pickup_date = CURRENT_DATE + INTERVAL '1 day' * $1
             AND p.is_active = true
             AND p.phone_number IS NOT NULL
             ORDER BY p.patient_id, mp.next_pickup_date DESC`,
            [daysAhead]
        );

        if (patients.rows.length === 0) {
            console.log(`No patients with pickups in ${daysAhead} days`);
            console.log('\n========================================');
            console.log('Job completed');
            console.log('Ended:', new Date().toISOString());
            console.log('========================================\n');
            return { success: true, sent: 0 };
        }

        console.log(`Found ${patients.rows.length} patients to remind\n`);

        // Prepare SMS batch
        const recipients = patients.rows.map(patient => {
            const pickupDate = convertToDisplayDate(patient.next_pickup_date);
            return {
                phoneNumber: patient.phone_number,
                message: `Hello ${patient.first_name}, reminder: Your medication pickup is due on ${pickupDate}. Please collect on time. Stay healthy!`,
                messageType: `reminder_${daysAhead}days`,
                patientId: patient.patient_id
            };
        });

        // Send bulk SMS
        const result = await smsService.sendBulkSMS(recipients);

        console.log(`\nReminders sent: ${result.successful}/${result.total}`);
        console.log(`Failed: ${result.failed}`);

        console.log('\n========================================');
        console.log('Job completed successfully');
        console.log('Ended:', new Date().toISOString());
        console.log('========================================\n');

        return {
            success: true,
            total: result.total,
            sent: result.successful,
            failed: result.failed
        };

    } catch (error) {
        console.error('Job failed:', error.message);

        console.log('\n========================================');
        console.log('Job completed with errors');
        console.log('Ended:', new Date().toISOString());
        console.log('========================================\n');

        return {
            success: false,
            error: error.message
        };
    }
};

// Convert YYYY-MM-DD to DD-MM-YYYY
const convertToDisplayDate = (yyyymmdd) => {
    if (!yyyymmdd) return '';
    const date = new Date(yyyymmdd);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
};

module.exports = sendRemindersJob;