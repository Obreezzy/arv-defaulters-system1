// backend/routes/auth.js

const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { query } = require('../config/db');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

// ============================================
// HELPERS
// ============================================

const generateStaffId = async () => {
  const result = await query(
    `SELECT staff_id FROM users WHERE staff_id IS NOT NULL ORDER BY staff_id DESC LIMIT 1`
  );
  if (result.rows.length === 0) return 'STF-001';
  const last = result.rows[0].staff_id;
  const num  = parseInt(last.replace('STF-', '')) + 1;
  return `STF-${String(num).padStart(3, '0')}`;
};

const generateNurseNumber = async () => {
  const result = await query(
    `SELECT nurse_number FROM users WHERE nurse_number IS NOT NULL ORDER BY nurse_number DESC LIMIT 1`
  );
  if (result.rows.length === 0) return 'NRS-101';
  const last = result.rows[0].nurse_number;
  const num  = parseInt(last.replace('NRS-', '')) + 1;
  return `NRS-${String(num).padStart(3, '0')}`;
};

// ============================================
// REGISTER NEW USER
// ============================================

router.post('/register', async (req, res) => {
  try {
    const {
      username, email, password, full_name, role,
      phone_number, clinic_name, clinic_number
    } = req.body;

    console.log('📝 Registration attempt:', { username, email, role });

    if (!username || !email || !password || !full_name || !role) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields: username, email, password, full_name, role'
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: 'Please provide a valid email address' });
    }

    const validRoles = ['admin', 'healthcare_worker', 'data_entry'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ success: false, message: `Role must be one of: ${validRoles.join(', ')}` });
    }

    // Clinic fields required for nurses and data entry
    if (role !== 'admin' && !clinic_number) {
      return res.status(400).json({ success: false, message: 'Clinic number is required for this role.' });
    }
    if (role !== 'admin' && !clinic_name) {
      return res.status(400).json({ success: false, message: 'Clinic name is required for this role.' });
    }

    const usernameCheck = await query('SELECT user_id FROM users WHERE username = $1', [username]);
    if (usernameCheck.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'Username already exists. Please choose another.' });
    }

    const emailCheck = await query('SELECT user_id FROM users WHERE email = $1', [email]);
    if (emailCheck.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'Email already registered.' });
    }

    const salt          = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    const staff_id     = await generateStaffId();
    const nurse_number = role === 'healthcare_worker' ? await generateNurseNumber() : null;

    console.log(`🪪 Staff ID: ${staff_id}${nurse_number ? ` | Nurse No: ${nurse_number}` : ''}`);

    const result = await query(
      `INSERT INTO users (
          username, email, password_hash, full_name, role, phone_number,
          is_active, staff_id, nurse_number, clinic_name, clinic_number
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING user_id, username, email, full_name, role, phone_number,
                 staff_id, nurse_number, clinic_name, clinic_number, created_at`,
      [
        username, email, password_hash, full_name, role,
        phone_number || null, true,
        staff_id, nurse_number,
        clinic_name   || null,
        clinic_number || null
      ]
    );

    const newUser = result.rows[0];
    console.log('✅ User created:', newUser.user_id);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      user: {
        user_id:       newUser.user_id,
        username:      newUser.username,
        email:         newUser.email,
        full_name:     newUser.full_name,
        role:          newUser.role,
        phone_number:  newUser.phone_number,
        staff_id:      newUser.staff_id,
        nurse_number:  newUser.nurse_number,
        clinic_name:   newUser.clinic_name,
        clinic_number: newUser.clinic_number,
        created_at:    newUser.created_at
      }
    });

  } catch (error) {
    console.error('❌ Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Error registering user',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ============================================
// LOGIN USER
// ============================================

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log('🔑 Login attempt:', email);

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide email and password' });
    }

    const result = await query(
      `SELECT user_id, username, email, password_hash, full_name, role,
              phone_number, is_active, staff_id, nurse_number,
              clinic_name, clinic_number, created_at
       FROM users WHERE email = $1`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(403).json({ success: false, message: 'Account is deactivated. Please contact administrator.' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const payload = {
      user_id:       user.user_id,
      username:      user.username,
      email:         user.email,
      role:          user.role,
      staff_id:      user.staff_id,
      nurse_number:  user.nurse_number  || null,
      clinic_name:   user.clinic_name   || null,
      clinic_number: user.clinic_number || null
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '24h'
    });

    console.log('🎟️ JWT generated for:', email, '| Role:', user.role);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        user_id:       user.user_id,
        username:      user.username,
        email:         user.email,
        full_name:     user.full_name,
        role:          user.role,
        phone_number:  user.phone_number,
        staff_id:      user.staff_id,
        nurse_number:  user.nurse_number  || null,
        clinic_name:   user.clinic_name   || null,
        clinic_number: user.clinic_number || null,
        created_at:    user.created_at
      }
    });

  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Error during login',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ============================================
// GET CURRENT USER (PROTECTED)
// ============================================

router.get('/me', verifyToken, async (req, res) => {
  try {
    const result = await query(
      `SELECT user_id, username, email, full_name, role,
              phone_number, is_active, staff_id, nurse_number,
              clinic_name, clinic_number, created_at
       FROM users WHERE user_id = $1`,
      [req.user.user_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const user = result.rows[0];

    res.json({
      success: true,
      user: {
        user_id:       user.user_id,
        username:      user.username,
        email:         user.email,
        full_name:     user.full_name,
        role:          user.role,
        phone_number:  user.phone_number,
        is_active:     user.is_active,
        staff_id:      user.staff_id,
        nurse_number:  user.nurse_number  || null,
        clinic_name:   user.clinic_name   || null,
        clinic_number: user.clinic_number || null,
        created_at:    user.created_at
      }
    });

  } catch (error) {
    console.error('❌ Error fetching user profile:', error);
    res.status(500).json({ success: false, message: 'Error fetching user profile' });
  }
});

module.exports = router;