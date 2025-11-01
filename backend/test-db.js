// Test if database connection works

const { query } = require('./config/db');

// Simple test query
const testConnection = async () => {
    try {
        console.log('🔍 Testing database connection...');
        
        // Simple query to test
        const result = await query('SELECT NOW()');
        
        console.log('✅ Database connection successful!');
        console.log('📅 Database time:', result.rows[0].now);
        
        // Test if our tables exist
        const tables = await query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        `);
        
        console.log('📊 Tables in database:');
        tables.rows.forEach(row => {
            console.log('   -', row.table_name);
        });
        
        process.exit(0); // Exit successfully
        
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
        process.exit(1); // Exit with error
    }
};

// Run the test
testConnection();