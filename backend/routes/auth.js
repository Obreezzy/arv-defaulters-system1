// backend/routes/auth.js
// This file handles user registration and login

// ============================================
// SECTION 1: IMPORT LIBRARIES
// ============================================

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../config/db');
const { verifyToken } = require('../middleware/auth');

// Create a router (mini-app for auth routes)
const router = express.Router();

// ============================================
// SECTION 2: REGISTER NEW USER
// ============================================

// POST /api/auth/register
// Purpose: Create a new user account
router.post('/register', async (req, res) => {
    try {
        // STEP 1: Get data from request body
        const { username, email, password, full_name, role, phone_number } = req.body;
        
        console.log('📝 Registration attempt:', { username, email, role });
        
        // STEP 2: Validate required fields
        if (!username || !email || !password || !full_name || !role) {
            return res.status(400).json({
                success: false,
                message: 'Please provide all required fields: username, email, password, full_name, role'
            });
        }
        
        // STEP 3: Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                message: 'Please provide a valid email address'
            });
        }
        
        // STEP 4: Validate role
        const validRoles = ['admin', 'healthcare_worker', 'data_entry'];
        if (!validRoles.includes(role)) {
            return res.status(400).json({
                success: false,
                message: `Role must be one of: ${validRoles.join(', ')}`
            });
        }
        
        // STEP 5: Check if username already exists
        const usernameCheck = await query(
            'SELECT user_id FROM users WHERE username = $1',
            [username]
        );
        
        if (usernameCheck.rows.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'Username already exists. Please choose another.'
            });
        }
        
        // STEP 6: Check if email already exists
        const emailCheck = await query(
            'SELECT user_id FROM users WHERE email = $1',
            [email]
        );
        
        if (emailCheck.rows.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'Email already registered. Please use another or login.'
            });
        }
        
        // STEP 7: Hash the password
        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(password, salt);
        
        console.log('🔐 Password hashed successfully');
        
        // STEP 8: Insert user into database
        const result = await query(
            `INSERT INTO users (username, email, password_hash, full_name, role, phone_number, is_active)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING user_id, username, email, full_name, role, phone_number, created_at`,
            [username, email, password_hash, full_name, role, phone_number || null, true]
        );
        
        const newUser = result.rows[0];
        
        console.log('✅ User created successfully:', newUser.user_id);
        
        // STEP 9: Send success response
        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            user: {
                user_id: newUser.user_id,
                username: newUser.username,
                email: newUser.email,
                full_name: newUser.full_name,
                role: newUser.role,
                phone_number: newUser.phone_number,
                created_at: newUser.created_at
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
// SECTION 3: LOGIN USER
// ============================================

// POST /api/auth/login
// Purpose: Login and get JWT token
router.post('/login', async (req, res) => {
    try {
        // STEP 1: Get credentials from request
        const { email, password } = req.body;
        
        console.log('🔑 Login attempt:', email);
        
        // STEP 2: Validate input
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Please provide email and password'
            });
        }
        
        // STEP 3: Find user in database
        const result = await query(
            `SELECT user_id, username, email, password_hash, full_name, role, 
                    phone_number, is_active, created_at
             FROM users 
             WHERE email = $1`,
            [email]
        );
        
        // STEP 4: Check if user exists
        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }
        
        const user = result.rows[0];
        
        // STEP 5: Check if account is active
        if (!user.is_active) {
            return res.status(403).json({
                success: false,
                message: 'Account is deactivated. Please contact administrator.'
            });
        }
        
        // STEP 6: Compare password with hash
        const isPasswordValid = await bcrypt.compare(password, user.password_hash);
        
        if (!isPasswordValid) {
            console.log('❌ Invalid password for:', email);
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }
        
        console.log('✅ Password verified for:', email);
        
        // STEP 7: Create JWT token
        const payload = {
            user_id: user.user_id,
            username: user.username,
            email: user.email,
            role: user.role
        };
        
        const token = jwt.sign(
            payload,
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
        );
        
        console.log('🎟️ JWT token generated for:', email);
        
        // STEP 8: Send success response with token
        res.json({
            success: true,
            message: 'Login successful',
            token: token,
            user: {
                user_id: user.user_id,
                username: user.username,
                email: user.email,
                full_name: user.full_name,
                role: user.role,
                phone_number: user.phone_number,
                created_at: user.created_at
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
// SECTION 4: GET CURRENT USER (PROTECTED)
// ============================================

// GET /api/auth/me
// Purpose: Get current user profile (requires authentication)
router.get('/me', verifyToken, async (req, res) => {
    try {
        console.log('👤 Fetching profile for user:', req.user.user_id);
        
        // Get user from database
        const result = await query(
            `SELECT user_id, username, email, full_name, role, 
                    phone_number, is_active, created_at
             FROM users 
             WHERE user_id = $1`,
            [req.user.user_id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        const user = result.rows[0];
        
        res.json({
            success: true,
            message: 'User profile retrieved successfully',
            user: {
                user_id: user.user_id,
                username: user.username,
                email: user.email,
                full_name: user.full_name,
                role: user.role,
                phone_number: user.phone_number,
                is_active: user.is_active,
                created_at: user.created_at
            }
        });
        
    } catch (error) {
        console.error('❌ Error fetching user profile:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching user profile',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ============================================
// SECTION 5: EXPORT ROUTER
// ============================================

module.exports = router;