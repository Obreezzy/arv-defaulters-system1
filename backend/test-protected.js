// Test protected route with and without token

const testProtectedRoute = async () => {
    console.log('🧪 TEST 1: Access protected route WITHOUT token\n');
    
    try {
        const response1 = await fetch('http://localhost:5000/api/auth/me', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });
        
        const data1 = await response1.json();
        console.log('📬 Status:', response1.status);
        console.log('📬 Response:', JSON.stringify(data1, null, 2));
        
        if (response1.status === 401) {
            console.log('✅ CORRECT! Access denied without token\n');
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
    
    console.log('─'.repeat(60));
    console.log('🧪 TEST 2: Login and get token\n');
    
    try {
        // First, login to get token
        const loginResponse = await fetch('http://localhost:5000/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email: 'obriel@arv.com',
                password: 'Obriel2024!'
            })
        });
        
        const loginData = await loginResponse.json();
        
        if (!loginData.success) {
            console.log('❌ Login failed:', loginData.message);
            return;
        }
        
        const token = loginData.token;
        console.log('✅ Login successful!');
        console.log('🎟️  Got token:', token.substring(0, 50) + '...\n');
        
        console.log('─'.repeat(60));
        console.log('🧪 TEST 3: Access protected route WITH token\n');
        
        // Now access protected route with token
        const response2 = await fetch('http://localhost:5000/api/auth/me', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`  // Include token!
            }
        });
        
        const data2 = await response2.json();
        console.log('📬 Status:', response2.status);
        console.log('📬 Response:', JSON.stringify(data2, null, 2));
        
        if (response2.status === 200 && data2.success) {
            console.log('\n✅ SUCCESS! Protected route accessed with valid token');
            console.log('👤 User:', data2.user.full_name);
            console.log('🎭 Role:', data2.user.role);
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
};

testProtectedRoute();