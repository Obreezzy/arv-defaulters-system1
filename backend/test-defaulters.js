// Test defaulter detection system

const testDefaulters = async () => {
    try {
        // Login
        console.log('🔑 Step 1: Logging in...\n');

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

        // Run defaulter detection
        console.log('🔍 Step 2: Running defaulter detection...\n');

        const detectResponse = await fetch('http://localhost:5000/api/defaulters/detect', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                grace_period: 3 // Days after missed pickup
            })
        });

        const detectResult = await detectResponse.json();

        console.log('📬 Status:', detectResponse.status);
        console.log('📬 Response:', JSON.stringify(detectResult, null, 2));

        if (detectResult.success) {
            console.log('\n✅ Defaulter Detection Complete!');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('🚨 New Defaulters Found:', detectResult.detected);
            
            if (detectResult.defaulters.length > 0) {
                console.log('\nDefaulter List:');
                detectResult.defaulters.forEach((d, i) => {
                    console.log(`\n${i + 1}. ${d.patient_info.first_name} ${d.patient_info.last_name}`);
                    console.log(`   Patient #: ${d.patient_info.patient_number}`);
                    console.log(`   Phone: ${d.patient_info.phone_number}`);
                    console.log(`   Days Overdue: ${d.days_overdue}`);
                    console.log(`   Risk Level: ${d.risk_level.toUpperCase()}`);
                    console.log(`   Missed Date: ${d.missed_pickup_date_display}`);
                });
            }
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

            // Get statistics
            console.log('📊 Step 3: Fetching defaulter statistics...\n');

            const statsResponse = await fetch('http://localhost:5000/api/defaulters/stats', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const statsResult = await statsResponse.json();

            if (statsResult.success) {
                const stats = statsResult.stats;
                console.log('📊 Defaulter Statistics:');
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                console.log('🚨 Active Defaulters:', stats.active_defaulters);
                console.log('✅ Returned:', stats.returned);
                console.log('❌ Lost to Follow-up:', stats.lost_to_followup);
                console.log('\nRisk Breakdown:');
                console.log('   🔴 High Risk:', stats.high_risk);
                console.log('   🟡 Medium Risk:', stats.medium_risk);
                console.log('   🟢 Low Risk:', stats.low_risk);
                console.log('\n📈 Average Days Overdue:', stats.avg_days_overdue, 'days');
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
            }
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
};

testDefaulters();