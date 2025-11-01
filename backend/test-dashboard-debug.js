// Debug dashboard issue

const testDashboardDebug = async () => {
    try {
        // Login
        console.log('🔑 Logging in...\n');

        const loginResponse = await fetch('http://localhost:5000/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'obriel@arv.com',
                password: 'Obriel2024!'
            })
        });

        const loginData = await loginResponse.json();
        const token = loginData.token;

        console.log('✅ Login successful!\n');

        // Get dashboard overview
        console.log('📊 Fetching dashboard overview...\n');

        const dashboardResponse = await fetch('http://localhost:5000/api/dashboard/overview', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        console.log('Response Status:', dashboardResponse.status);
        
        const dashboard = await dashboardResponse.json();
        
        console.log('\nFull Response:');
        console.log(JSON.stringify(dashboard, null, 2));

        if (dashboard.success) {
            console.log('\n✅ Dashboard loaded successfully!');
        } else {
            console.log('\n❌ Dashboard failed:', dashboard.message);
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error('Stack:', error.stack);
    }
};

testDashboardDebug();