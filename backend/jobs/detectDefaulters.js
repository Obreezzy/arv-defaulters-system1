const axios = require('axios');
const { sendFollowUp } = require('./sendFollowUps'); 
const { sendReminder } = require('./sendReminders');

// Import your database models here (e.g., MongoDB/Mongoose, PostgreSQL, etc.)
// const db = require('./models'); 

// Ensure this matches the port your Flask app is running on
const ML_API_URL = process.env.ML_API_URL || 'http://127.0.0.1:5000/predict/defaulters';

async function runDefaulterDetection() {
    try {
        console.log('Starting defaulter detection job...');

        // 1. Fetch patients from your database
        // Example: Fetch active patients who have a refill coming up soon
        // const rawPatientsFromDB = await db.Patient.find({ isActive: true }); 
        
        // --- DUMMY DATA FOR TESTING ---
        // Replace this array with your actual database query results
        const rawPatientsFromDB = [
            {
                _id: "P-1001",
                age: 34,
                genderStr: "Female",
                distance: 12.5,
                refillInterval: 3,
                stockoutRate: 0.05,
                frailtyScore: 0.2,
                currentVL: 400,
                missedBefore: 1
            }
        ];

        if (rawPatientsFromDB.length === 0) {
            console.log('No patients found for evaluation.');
            return;
        }

        // 2. MAPPING STEP: Translate DB fields to the exact ML feature keys
        const formattedPatients = rawPatientsFromDB.map(patient => {
            return {
                // Tracking ID (passed to Flask and returned to us)
                patient_id: patient._id, 
                
                // --- THE 8 EXACT REQUIRED KEYS ---
                distance_to_clinic: patient.distance, 
                dispensing_interval: patient.refillInterval, 
                facility_stockout_rate_12m: patient.stockoutRate,  
                patient_age_years: patient.age, 
                
                // Convert gender string to integer (e.g., Female = 0, Male = 1) 
                // Adjust this logic to match how you trained the model!
                patient_gender: patient.genderStr === "Male" ? 1 : 0, 
                
                patient_frailty_latent: patient.frailtyScore, 
                viral_load: patient.currentVL,
                missed_pickups_history: patient.missedBefore
            };
        });

        console.log(`Sending ${formattedPatients.length} records to ML API for evaluation...`);

        // 3. Send batch to the Flask ML API
        const response = await axios.post(ML_API_URL, formattedPatients);
        const { predictions } = response.data;

        // 4. Process the ML results and trigger actions
        let highRiskCount = 0;
        let lowRiskCount = 0;

        for (const result of predictions) {
            if (result.will_default && result.risk_score > 0.85) {
                console.log(`[ALERT] High risk detected for ${result.patient_id} (Score: ${result.risk_score}). Initiating follow-up.`);
                
                // Trigger the high-priority intervention
                await sendFollowUp(result.patient_id);
                highRiskCount++;
                
                // Optional: Flag patient in database
                // await db.Patient.updateOne({ _id: result.patient_id }, { requiresOutreach: true, riskScore: result.risk_score });
            } else {
                console.log(`[OK] Standard risk for ${result.patient_id} (Score: ${result.risk_score}). Sending standard reminder.`);
                
                // Trigger standard SMS reminder
                await sendReminder(result.patient_id);
                lowRiskCount++;
            }
        }

        console.log(`Defaulter detection job completed. High Risk: ${highRiskCount}, Standard Risk: ${lowRiskCount}`);
    } catch (error) {
        console.error('Error in detectDefaulters job:', error.message);
    }
}

module.exports = { runDefaulterDetection };