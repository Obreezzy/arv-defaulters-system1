// Test registration endpoint

const testRegister = async () => {
    try {
        const userData = {
            username: 'obriel',
            email: 'obriel@arv.com',
            password: 'Obriel2024!',
            full_name: 'Obriel Makamanzi',
            role: 'admin',
            phone_number: '+263771234567'
        };

        console.log('📝 Attempting to register user:', userData.username);
        
        const response = await fetch('http://localhost:5000/api/auth/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(userData)
        });
        
        const data = await response.json();
        
        console.log('\n📬 Response Status:', response.status);
        console.log('📬 Response Data:', JSON.stringify(data, null, 2));
        
        if (data.success) {
            console.log('\n✅ SUCCESS! User registered!');
            console.log('👤 User ID:', data.user.user_id);
            console.log('📧 Email:', data.user.email);
            console.log('🎭 Role:', data.user.role);
        } else {
            console.log('\n❌ Registration failed:', data.message);
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
};

testRegister();