// Test medication pickup recording

const testPickup = async () => {
    try {
        // Login first
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

        // Record pickup
        console.log('💊 Step 2: Recording medication pickup...\n');

        const pickupData = {
            patient_id: 1,
            treatment_id: 1,
            actual_pickup_date: '2024-10-29',
            days_supply: 30,
            quantity_dispensed: 30,
            notes: 'Patient doing well, no side effects reported'
        };

        const pickupResponse = await fetch('http://localhost:5000/api/pickups', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(pickupData)
        });

        const pickupResult = await pickupResponse.json();

        console.log('📬 Status:', pickupResponse.status);
        console.log('📬 Response:', JSON.stringify(pickupResult, null, 2));

        if (pickupResult.success) {
            console.log('\n✅ SUCCESS! Pickup recorded!');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('📝 Pickup ID:', pickupResult.pickup.pickup_id);
            console.log('👤 Patient ID:', pickupResult.pickup.patient_id);
            console.log('💊 Days Supply:', pickupResult.pickup.days_supply);
            console.log('📅 Next Pickup:', pickupResult.pickup.next_pickup_date_display);
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
};

testPickup();