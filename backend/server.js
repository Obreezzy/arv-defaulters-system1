// backend/server.js
// This is the MAIN FILE - the entry point of your application!

// ============================================
// SECTION 1: IMPORT LIBRARIES
// ============================================

const express = require('express');      // Web framework (makes building APIs easy)
const cors = require('cors');            // Allows frontend to talk to backend
const dotenv = require('dotenv');        // Loads .env file

// Load environment variables from .env file
dotenv.config();

// ============================================
// SECTION 2: CREATE EXPRESS APP
// ============================================

// Think of 'app' as your restaurant
// It receives orders (requests) and sends food (responses)
const app = express();

// What port to run on (from .env file, or default to 5000)
const PORT = process.env.PORT || 5000;

// ============================================
// SECTION 3: MIDDLEWARE (Pre-processing)
// ============================================

// Middleware = Functions that run BEFORE your routes
// Think of them as security guards and helpers at the door

// 1. CORS - Allow frontend to connect
// Without this, React can't talk to your backend (security feature)
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true  // Allow cookies/authentication
}));

// 2. JSON Parser - Understand JSON data
// When frontend sends data like { "name": "John" }
// This converts it to JavaScript object we can use
app.use(express.json());

// 3. URL Encoded Parser - Understand form data
// When forms are submitted, this processes them
app.use(express.urlencoded({ extended: true }));

// 4. Request Logger - See what's happening
// Every request will be logged to console
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.path}`);
    next(); // Pass to next middleware/route
});

// ============================================
// SECTION 4: BASIC ROUTES (Endpoints)
// ============================================

// Health Check Route
// URL: http://localhost:5000/api/health
// Purpose: Check if server is running
app.get('/api/health', (req, res) => {
    // req = request (what client sent)
    // res = response (what we send back)
    
    res.json({ 
        success: true,
        message: 'ARV Defaulters System API is running',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV
    });
});

// Welcome Route
// URL: http://localhost:5000/
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'Welcome to ARV Defaulters Management System API',
        version: '1.0.0',
        endpoints: {
            health: '/api/health',
            auth: '/api/auth',
            patients: '/api/patients',
            defaulters: '/api/defaulters'
        }
    });
});

// ============================================
// SECTION 5: IMPORT ROUTES
// ============================================

const authRoutes = require('./routes/auth');
const patientRoutes = require('./routes/patients');
const pickupRoutes = require('./routes/pickups');
const defaulterRoutes = require('./routes/defaulters');
const dashboardRoutes = require('./routes/dashboard');

app.use('/api/auth', authRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/pickups', pickupRoutes);
app.use('/api/defaulters', defaulterRoutes);
app.use('/api/dashboard', dashboardRoutes);

// ============================================
// SECTION 6: ERROR HANDLING
// ============================================

// 404 Handler - Route Not Found
// If no route matches, this runs
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: `Route ${req.method} ${req.path} not found`,
        availableRoutes: ['/', '/api/health']
    });
});

// Global Error Handler
// If any error occurs anywhere, this catches it
app.use((err, req, res, next) => {
    // Log the error for debugging
    console.error('❌ Error occurred:');
    console.error(err.stack);
    
    // Send error response to client
    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal server error',
        // Only show error details in development
        ...(process.env.NODE_ENV === 'development' && { 
            error: err.stack 
        })
    });
});

// ============================================
// SECTION 7: START THE SERVER
// ============================================

app.listen(PORT, () => {
    console.log('\n🚀 ================================');
    console.log('🚀  SERVER STARTED SUCCESSFULLY');
    console.log('🚀 ================================');
    console.log(`📍 Server running on port: ${PORT}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV}`);
    console.log(`🔗 Local: http://localhost:${PORT}`);
    console.log(`🔗 Health Check: http://localhost:${PORT}/api/health`);
    console.log('🚀 ================================\n');
    console.log('💡 Press Ctrl+C to stop the server\n');
});

// Handle server errors
app.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use`);
        console.error('💡 Try closing other applications or use a different port');
    } else {
        console.error('❌ Server error:', error);
    }
    process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('\n👋 SIGTERM received. Shutting down gracefully...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('\n👋 SIGINT received. Shutting down gracefully...');
    process.exit(0);
});

// Export for testing
module.exports = app;