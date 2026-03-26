const express = require('express');
const router = express.Router();
const { query } = require('../config/db');
const { verifyToken } = require('../middleware/auth');

router.use(verifyToken);

// ==========================================
// 1. GET ALL DEFAULTERS
// ==========================================
router.get('/', async (req, res) => {
    try {
        const result = await query(`
            SELECT d.*, p.first_name, p.last_name, p.phone_number, p.patient_number 
            FROM defaulters d
            JOIN patients p ON d.patient_id = p.patient_id
            ORDER BY 
                CASE WHEN d.status = 'pending' THEN 1 ELSE 2 END,
                d.days_overdue DESC
        `);
        res.json({ success: true, defaulters: result.rows });
    } catch (err) {
        console.error("Error fetching defaulters:", err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ==========================================
// 2. RUN AI DETECTION SCAN
// ==========================================
router.post('/detect', async (req, res) => {
    const grace_period = req.body.grace_period || 3;
    try {
        await query('BEGIN');
        
        // Find patients who missed pickups
        const missedPickups = await query(`
            SELECT patient_id, next_pickup_date 
            FROM medication_pickups 
            WHERE next_pickup_date < CURRENT_DATE - $1::integer
            AND patient_id NOT IN (
                SELECT patient_id FROM medication_pickups 
                WHERE actual_pickup_date >= CURRENT_DATE - $1::integer
            )
        `, [grace_period]);

        let addedCount = 0;
        for (const pickup of missedPickups.rows) {
            const daysOverdue = Math.floor((new Date() - new Date(pickup.next_pickup_date)) / (1000 * 60 * 60 * 24));
            
            // Basic Risk Logic (You can expand this later)
            let riskLevel = 'Low';
            if (daysOverdue > 14) riskLevel = 'High';
            else if (daysOverdue > 7) riskLevel = 'Medium';

            // Insert if they aren't already pending
            const existing = await query(`SELECT * FROM defaulters WHERE patient_id = $1 AND status = 'pending'`, [pickup.patient_id]);
            
            if (existing.rows.length === 0) {
                await query(`
                    INSERT INTO defaulters (patient_id, days_overdue, risk_level, status, flagged_date)
                    VALUES ($1, $2, $3, 'pending', CURRENT_DATE)
                `, [pickup.patient_id, daysOverdue, riskLevel]);
                addedCount++;
            } else {
                // Update days overdue if already existing
                await query(`UPDATE defaulters SET days_overdue = $1, risk_level = $2 WHERE patient_id = $3 AND status = 'pending'`, 
                [daysOverdue, riskLevel, pickup.patient_id]);
            }
        }
        
        await query('COMMIT');
        res.json({ success: true, message: `Scan complete. Found ${addedCount} new defaulters.` });
    } catch (err) {
        await query('ROLLBACK');
        console.error("Error detecting defaulters:", err);
        res.status(500).json({ success: false, message: 'Detection failed' });
    }
});

// ==========================================
// 3. RESOLVE DEFAULTER STATUS
// ==========================================
router.put('/:id/resolve', async (req, res) => {
    const { status } = req.body;
    const defaulterId = req.params.id;

    try {
        // We removed 'updated_at = CURRENT_TIMESTAMP' here to prevent 
        // database crashes if your table doesn't have that specific column!
        const result = await query(
            `UPDATE defaulters 
             SET status = $1 
             WHERE defaulter_id = $2 
             RETURNING *`,
            [status, defaulterId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Defaulter record not found' });
        }

        res.json({ success: true, message: 'Status updated successfully', data: result.rows[0] });
    } catch (err) {
        console.error("Error resolving defaulter:", err);
        res.status(500).json({ success: false, message: 'Server error while resolving' });
    }
});

module.exports = router;