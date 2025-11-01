// Test dashboard API

const testDashboard = async () => {
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

        // Get dashboard overview
        console.log('📊 Step 2: Fetching dashboard overview...\n');

        const dashboardResponse = await fetch('http://localhost:5000/api/dashboard/overview', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const dashboard = await dashboardResponse.json();

        if (dashboard.success) {
            const { summary, patients, pickups, defaulters, alerts } = dashboard.data;

            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('              📊 DASHBOARD OVERVIEW');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

            console.log('🎯 KEY METRICS:');
            console.log('   👥 Total Patients:', summary.total_patients);
            console.log('   ✅ Active Patients:', summary.active_patients);
            console.log('   🚨 Active Defaulters:', summary.active_defaulters);
            console.log('   📈 Adherence Rate:', summary.adherence_rate + '%');
            console.log('   📅 Upcoming Pickups (7 days):', summary.upcoming_pickups_7days);
            console.log('   🔴 High Risk Defaulters:', summary.high_risk_defaulters);

            console.log('\n👥 PATIENT BREAKDOWN:');
            console.log('   Active:', patients.active_patients);
            console.log('   Inactive:', patients.inactive_patients);
            console.log('   Male:', patients.male_patients);
            console.log('   Female:', patients.female_patients);
            console.log('   New This Month:', patients.new_this_month);
            console.log('   New This Week:', patients.new_this_week);

            console.log('\n💊 PICKUP STATISTICS:');
            console.log('   Total Pickups:', pickups.total_pickups);
            console.log('   This Month:', pickups.pickups_this_month);
            console.log('   This Week:', pickups.pickups_this_week);
            console.log('   Today:', pickups.pickups_today);
            console.log('   Avg Days Supply:', pickups.avg_days_supply, 'days');

            console.log('\n🚨 DEFAULTER BREAKDOWN:');
            console.log('   Active:', defaulters.active_defaulters);
            console.log('   Returned:', defaulters.returned);
            console.log('   Lost to Follow-up:', defaulters.lost_to_followup);
            console.log('   High Risk:', defaulters.high_risk);
            console.log('   Medium Risk:', defaulters.medium_risk);
            console.log('   Low Risk:', defaulters.low_risk);
            console.log('   Avg Days Overdue:', defaulters.avg_days_overdue, 'days');

            if (alerts.length > 0) {
                console.log('\n⚠️  ALERTS:');
                alerts.forEach((alert, i) => {
                    const icon = alert.type === 'critical' ? '🔴' : 
                                alert.type === 'warning' ? '🟡' : '🔵';
                    console.log(`   ${icon} ${alert.message}`);
                    console.log(`      → ${alert.action}`);
                });
            }

            console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        }

        // Get urgent actions
        console.log('🚨 Step 3: Fetching urgent actions...\n');

        const urgentResponse = await fetch('http://localhost:5000/api/dashboard/urgent-actions', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const urgent = await urgentResponse.json();

        if (urgent.success) {
            const { summary, urgent_actions } = urgent;

            console.log('🚨 URGENT ACTIONS NEEDED:');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('Total Urgent Items:', summary.total_urgent);
            console.log('   🔴 Critical:', summary.critical);
            console.log('   🟡 High:', summary.high);
            console.log('   🟢 Medium:', summary.medium);

            if (urgent_actions.high_risk_defaulters.length > 0) {
                console.log('\n🔴 HIGH RISK DEFAULTERS (Sample):');
                urgent_actions.high_risk_defaulters.slice(0, 3).forEach((d, i) => {
                    console.log(`   ${i + 1}. ${d.first_name} ${d.last_name} (${d.patient_number})`);
                    console.log(`      Days Overdue: ${d.days_overdue} | Follow-ups: ${d.followup_count}`);
                });
            }

            if (urgent_actions.pickups_today.length > 0) {
                console.log('\n🟡 PICKUPS EXPECTED TODAY:');
                urgent_actions.pickups_today.forEach((p, i) => {
                    console.log(`   ${i + 1}. ${p.first_name} ${p.last_name} (${p.patient_number})`);
                });
            }

            console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
};

testDashboard();