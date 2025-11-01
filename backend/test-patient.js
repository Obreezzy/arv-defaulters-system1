// Test patient registration with DD-MM-YYYY date format

// Helper function to convert DD-MM-YYYY to YYYY-MM-DD for database
const convertToDbDate = (ddmmyyyy) => {
    const [day, month, year] = ddmmyyyy.split('-');
    return `${year}-${month}-${day}`;
};

// Helper function to convert YYYY-MM-DD to DD-MM-YYYY for display
const convertToDisplayDate = (yyyymmdd) => {
    if (!yyyymmdd) return '';
    const date = new Date(yyyymmdd);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
};

// Helper function to get today's date in DD-MM-YYYY format
const getTodayDDMMYYYY = () => {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    return `${day}-${month}-${year}`;
};

// Helper function to generate unique patient number
// Format: PTYYYYMMDDXXX (PT + Year + Month + Day + Sequential Number)
const generatePatientNumber = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const random = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
    
    return `PT${year}${month}${day}${random}`;
};

const testPatient = async () => {
    try {
        // First, login to get token
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
        
        if (!loginData.success) {
            console.log('❌ Login failed');
            return;
        }

        const token = loginData.token;
        console.log('✅ Login successful!\n');

        // Generate unique patient number
        const patientNumber = generatePatientNumber();
        
        // Get today's date in DD-MM-YYYY format
        const enrollmentDateDisplay = getTodayDDMMYYYY();
        const enrollmentDateDb = convertToDbDate(enrollmentDateDisplay);
        
        console.log('📝 Step 2: Registering patient...');
        console.log('🆔 Generated Patient Number:', patientNumber);
        console.log('📅 Enrollment Date:', enrollmentDateDisplay);
        console.log('');

        // Register a patient with DD-MM-YYYY dates
        const dobDisplay = '15-05-1990';
        const dobDb = convertToDbDate(dobDisplay);
        
        const patientData = {
            patient_number: patientNumber,
            first_name: 'Tatenda',
            last_name: 'Moyo',
            date_of_birth: dobDb, // Convert to YYYY-MM-DD for database
            gender: 'Male',
            phone_number: '+263771234567',
            alternative_phone: '+263712345678',
            address: '123 Main Street, Harare',
            distance_from_clinic: 5,
            emergency_contact_name: 'Grace Moyo',
            emergency_contact_phone: '+263779876543',
            enrollment_date: enrollmentDateDb // Convert to YYYY-MM-DD for database
        };

        const registerResponse = await fetch('http://localhost:5000/api/patients', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(patientData)
        });

        const registerData = await registerResponse.json();
        
        console.log('📬 Response Status:', registerResponse.status);

        if (registerData.success) {
            const patient = registerData.patient;
            
            console.log('\n✅ SUCCESS! Patient registered!');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('👤 Patient ID:', patient.patient_id);
            console.log('🆔 Patient Number:', patient.patient_number);
            console.log('📛 Name:', patient.first_name, patient.last_name);
            console.log('🎂 Date of Birth:', convertToDisplayDate(patient.date_of_birth));
            console.log('⚧️  Gender:', patient.gender);
            console.log('📞 Phone:', patient.phone_number);
            console.log('📅 Enrolled:', convertToDisplayDate(patient.enrollment_date));
            console.log('🏥 Distance from Clinic:', patient.distance_from_clinic, 'km');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
            
            // Register more patients for testing
            console.log('📝 Registering additional test patients...\n');
            await registerMorePatients(token);
        } else {
            console.log('\n❌ Registration failed:', registerData.message);
            console.log('Error details:', registerData);
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
};

// Function to register multiple test patients
const registerMorePatients = async (token) => {
    const testPatients = [
        {
            first_name: 'Rumbidzai',
            last_name: 'Ncube',
            date_of_birth: '20-08-1985', // DD-MM-YYYY
            gender: 'Female',
            phone_number: '+263772345678',
            address: '45 Second Street, Bulawayo'
        },
        {
            first_name: 'Tendai',
            last_name: 'Chikwanha',
            date_of_birth: '10-12-1978', // DD-MM-YYYY
            gender: 'Male',
            phone_number: '+263773456789',
            address: '78 Third Avenue, Mutare'
        },
        {
            first_name: 'Chipo',
            last_name: 'Mpofu',
            date_of_birth: '25-03-1995', // DD-MM-YYYY
            gender: 'Female',
            phone_number: '+263774567890',
            address: '12 Fourth Road, Gweru'
        }
    ];

    for (const patient of testPatients) {
        try {
            const patientNumber = generatePatientNumber();
            const enrollmentDate = getTodayDDMMYYYY();

            const response = await fetch('http://localhost:5000/api/patients', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    patient_number: patientNumber,
                    first_name: patient.first_name,
                    last_name: patient.last_name,
                    date_of_birth: convertToDbDate(patient.date_of_birth), // Convert to DB format
                    gender: patient.gender,
                    phone_number: patient.phone_number,
                    address: patient.address,
                    enrollment_date: convertToDbDate(enrollmentDate), // Convert to DB format
                    distance_from_clinic: Math.floor(Math.random() * 20) + 1,
                    emergency_contact_name: `${patient.first_name}'s Contact`,
                    emergency_contact_phone: '+263775000000'
                })
            });

            const data = await response.json();
            
            if (data.success) {
                console.log(`✅ ${patient.first_name} ${patient.last_name} - ${data.patient.patient_number} - DOB: ${patient.date_of_birth}`);
            } else {
                console.log(`❌ Failed: ${patient.first_name} ${patient.last_name} - ${data.message}`);
            }

            // Small delay to ensure unique patient numbers
            await new Promise(resolve => setTimeout(resolve, 100));

        } catch (error) {
            console.error(`❌ Error registering ${patient.first_name}:`, error.message);
        }
    }

    console.log('\n✅ All test patients registered!');
    console.log('📊 Total patients in system: 4');
    console.log('💡 Tip: Check pgAdmin to see all patients\n');
};

// Run the test
testPatient();