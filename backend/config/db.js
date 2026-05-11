// backend/config/db.js

// ============================================
// STEP 1: Import Required Libraries
// ============================================

// pg = PostgreSQL library for Node.js
// Pool = Manages multiple database connections efficiently
const { Pool } = require('pg');

// dotenv = Loads variables from .env file
require('dotenv').config();

// ============================================
// STEP 2: Create Database Connection Pool
// ============================================

// What is a Pool?
// Think of it like a swimming pool of database connections
// Instead of creating a new connection every time (slow),
// we reuse connections from the pool (fast!)

const pool = new Pool({
    host: process.env.DB_HOST,           // Where is database? (localhost)
    port: process.env.DB_PORT,           // Which port? (5432)
    database: process.env.DB_NAME,       // Which database? (arv_defaulters_db)
    user: process.env.DB_USER,           // Username (postgres)
    password: process.env.DB_PASSWORD,   // Password (your password)
    
    // Advanced settings:
    max: 20,                      // Maximum 20 connections at once
    idleTimeoutMillis: 30000,     // Close idle connections after 30 seconds
    connectionTimeoutMillis: 2000, // Wait max 2 seconds to connect
});

// ============================================
// STEP 3: Event Listeners (Know What's Happening)
// ============================================

// When successfully connected to database
pool.on('connect', () => {
    console.log('Database connected successfully');
});

// When there's an error
pool.on('error', (err) => {
    console.error('Unexpected database error:', err);
    process.exit(-1); // Stop the app if database fails
});

// ============================================
// STEP 4: Helper Function for Queries
// ============================================

// This function makes it easier to run SQL queries
// It also logs how long each query takes (for debugging)

const query = async (text, params) => {
    const start = Date.now(); // Record start time
    
    try {
        // Run the query
        const res = await pool.query(text, params);
        
        // Calculate how long it took
        const duration = Date.now() - start;
        
        // Log for debugging
        console.log('Executed query', { 
            text,           // What query ran
            duration,       // How long it took (milliseconds)
            rows: res.rowCount  // How many rows affected
        });
        
        return res; // Return results
        
    } catch (error) {
        console.error('Database query error:', error);
        throw error; // Pass error up to be handled
    }
};

// ============================================
// STEP 5: Get Single Client (For Transactions)
// ============================================

// Sometimes we need to run multiple queries as one unit
// Example: Transfer money = subtract from A AND add to B
// If one fails, both should fail (transaction)

const getClient = async () => {
    const client = await pool.connect();
    
    // Save original functions
    const query = client.query.bind(client);
    const release = client.release.bind(client);
    
    // Set timeout warning (if client not released in 5 seconds)
    const timeout = setTimeout(() => {
        console.error('`A client has been checked out for more than 5 seconds!');
    }, 5000);
    
    // Override release to clear timeout
    client.release = () => {
        clearTimeout(timeout);
        return release();
    };
    
    return client;
};

// ============================================
// STEP 6: Export Functions
// ============================================

// Make these available to other files
module.exports = {
    pool,      // The connection pool
    query,     // Function to run queries
    getClient  // Function to get single client
};