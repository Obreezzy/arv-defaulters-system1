/**
 * 🧠 SMART RISK ENGINE
 * This module calculates a probabilistic risk score for ARV adherence.
 * It uses a Weighted Factor Model commonly used in medical expert systems.
 */

const calculateRiskScore = (patient, daysOverdue, pastDefaults = 0) => {
    let riskScore = 0;
    let riskFactors = [];

    // 1. LATENESS FACTOR (Weight: 40%)
    // The more days overdue, the higher the immediate risk
    if (daysOverdue > 30) {
        riskScore += 40;
        riskFactors.push("Critically Overdue (>30 days)");
    } else if (daysOverdue > 14) {
        riskScore += 30;
        riskFactors.push("Significantly Overdue (>2 weeks)");
    } else if (daysOverdue > 7) {
        riskScore += 20;
        riskFactors.push("Missed Appointment (>1 week)");
    } else if (daysOverdue > 0) {
        riskScore += 10;
        riskFactors.push("Slightly Delayed");
    }

    // 2. DEMOGRAPHIC VULNERABILITY (Weight: 20%)
    // Young adults (18-24) often face higher social stigma/instability
    const age = getAge(patient.date_of_birth);
    if (age >= 18 && age <= 24) {
        riskScore += 20;
        riskFactors.push("High-Risk Age Group (18-24)");
    } else if (age > 65) {
        riskScore += 10;
        riskFactors.push("Geriatric Vulnerability");
    }

    // 3. GEOGRAPHIC BARRIER (Weight: 20%)
    // Patients living far away are more likely to default due to transport costs
    const distance = parseFloat(patient.distance_from_clinic || 0);
    if (distance > 20) {
        riskScore += 20;
        riskFactors.push(`Long Distance Commuter (${distance}km)`);
    } else if (distance > 10) {
        riskScore += 10;
        riskFactors.push("Moderate Distance Barrier");
    }

    // 4. HISTORICAL ADHERENCE (Weight: 20%)
    // Previous behavior is the best predictor of future behavior
    if (pastDefaults > 2) {
        riskScore += 20;
        riskFactors.push("Chronic History of Defaulting");
    } else if (pastDefaults > 0) {
        riskScore += 10;
        riskFactors.push("Previous Default Record");
    }

    // CAP SCORE AT 100
    riskScore = Math.min(riskScore, 100);

    // DETERMINE RISK LABEL
    let riskLabel = 'Low';
    if (riskScore >= 75) riskLabel = 'High';
    else if (riskScore >= 40) riskLabel = 'Medium';

    return {
        score: riskScore,
        label: riskLabel,
        factors: riskFactors
    };
};

// Helper: Calculate Age
const getAge = (dobString) => {
    if (!dobString) return 0;
    const today = new Date();
    const birthDate = new Date(dobString);
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return age;
};

module.exports = { calculateRiskScore };