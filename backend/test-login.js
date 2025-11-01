// Test login endpoint

const testLogin = async () => {
    try {
        const credentials = {
            email: 'obriel@arv.com',
            password: 'Obriel2024!'
        };

        console.log('🔑 Attempting to login:', credentials.email);
        
        const response = await fetch('http://localhost:5000/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(credentials)
        });
        
        const data = await response.json();
        
        console.log('\n📬 Response Status:', response.status);
        console.log('📬 Response Data:', JSON.stringify(data, null, 2));
        
        if (data.success) {
            console.log('\n✅ LOGIN SUCCESSFUL!');
            console.log('👤 User:', data.user.full_name);
            console.log('🎭 Role:', data.user.role);
            console.log('\n🎟️  JWT Token:');
            console.log(data.token);
            console.log('\n💡 Save this token! You\'ll need it for protected routes.');
        } else {
            console.log('\n❌ Login failed:', data.message);
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
};

testLogin();