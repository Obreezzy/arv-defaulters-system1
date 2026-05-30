const express = require('express');
const router  = express.Router();
const { query } = require('../config/db');
const { verifyToken } = require('../middleware/auth');

router.use(verifyToken);

router.get('/', async (req, res) => {
    try {
        const result = await query(`SELECT * FROM facilities ORDER BY facility_name`);
        res.json({ success: true, facilities: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const result = await query(`SELECT * FROM facilities WHERE facility_id = $1`, [req.params.id]);
        if (result.rows.length === 0)
            return res.status(404).json({ success: false, message: 'Facility not found' });
        res.json({ success: true, facility: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/', async (req, res) => {
    const { facility_id, facility_name, facility_type, province, district, gps_lat, gps_lon, catchment_type } = req.body;
    try {
        const result = await query(`
            INSERT INTO facilities (facility_id, facility_name, facility_type, province, district, gps_lat, gps_lon, catchment_type)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *
        `, [facility_id, facility_name, facility_type || null, province || null, district || null, gps_lat || null, gps_lon || null, catchment_type || null]);
        res.status(201).json({ success: true, facility: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
