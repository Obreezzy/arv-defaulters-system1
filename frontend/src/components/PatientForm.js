import React, { useState } from 'react';
import './PatientForm.css';
import { patientsAPI } from '../services/api';
import { useNotifications } from '../contexts/NotificationContext';

function PatientForm({ onClose, onSuccess }) {
  const { showToast, addNotification } = useNotifications();

  const [formData, setFormData] = useState({
    patient_number: '',
    first_name: '',
    last_name: '',
    date_of_birth: '',
    gender: '',
    enrollment_date: '',
    phone_number: '',
    alternative_phone: '',
    email: '',
    address: '',
    city: '',
    distance_from_clinic: '',
    arv_regimen: '',
    pickup_frequency: '30',
    next_pickup_date: '',       // used when isNewPatient = true
    emergency_contact_name: '',
    emergency_contact_phone: ''
  });

  // true  = first-time patient → staff enters pickup date manually
  // false = returning/transfer → pickup date auto-calculated
  const [isNewPatient, setIsNewPatient] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [success, setSuccess] = useState(false);

  // Generate patient number + default enrollment date on mount
  useState(() => {
    const patientNumber = 'P' + Date.now().toString().slice(-8);
    setFormData(prev => ({
      ...prev,
      patient_number: patientNumber,
      enrollment_date: new Date().toISOString().split('T')[0]
    }));
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Preview auto-calculated date (for returning patients only)
  const getAutoPickupPreview = () => {
    if (!formData.enrollment_date || !formData.pickup_frequency) return null;
    const enroll = new Date(formData.enrollment_date);
    enroll.setDate(enroll.getDate() + parseInt(formData.pickup_frequency));
    return enroll.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const validateForm = () => {
    if (!formData.patient_number)                    { setError('Patient number is required'); return false; }
    if (!formData.first_name || !formData.last_name) { setError('First and last name are required'); return false; }
    if (!formData.date_of_birth)                     { setError('Date of birth is required'); return false; }
    if (!formData.gender)                            { setError('Gender is required'); return false; }
    if (!formData.enrollment_date)                   { setError('Enrollment date is required'); return false; }
    if (!formData.phone_number)                      { setError('Phone number is required'); return false; }

    const phoneRegex = /^[\+]?[0-9\s\-\(\)]+$/;
    if (!phoneRegex.test(formData.phone_number)) { setError('Please enter a valid phone number'); return false; }

    if (formData.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.email)) { setError('Please enter a valid email address'); return false; }
    }

    if (new Date(formData.date_of_birth) >= new Date()) {
      setError('Date of birth must be in the past'); return false;
    }

    // First-time patient MUST have a manually entered pickup date
    if (isNewPatient && !formData.next_pickup_date) {
      setError('Please enter the first pickup date for this new patient'); return false;
    }

    setError(null);
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) {
      showToast({ type: 'error', message: error, duration: 4000 });
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const payload = {
        ...formData,
        is_new_patient: isNewPatient   // tells backend which pickup logic to use
      };

      console.log('📤 Submitting patient data:', payload);
      const response = await patientsAPI.createPatient(payload);
      console.log('✅ Patient created:', response);
      setSuccess(true);

      const patientName = `${formData.first_name} ${formData.last_name}`;
      showToast({ type: 'success', title: 'Patient Registered', message: `${patientName} added successfully`, duration: 5000 });
      addNotification({ type: 'patient', title: 'New Patient Registered', message: `${patientName} (${formData.patient_number}) enrolled`, showToast: false });

      // Wait for loadPatients to finish BEFORE closing modal
      // so the new patient appears in the list immediately
      setTimeout(async () => {
        if (onSuccess) await onSuccess();
        if (onClose)   onClose();
      }, 1500);

    } catch (err) {
      console.error('❌ Error creating patient:', err);
      const errorMessage = err.response?.data?.message || err.response?.data?.error || 'Failed to register patient. Please try again.';
      setError(errorMessage);
      setLoading(false);
      showToast({ type: 'error', title: 'Registration Failed', message: errorMessage, duration: 5000 });
    }
  };

  if (success) {
    return (
      <div className="form-overlay">
        <div className="form-modal success-modal">
          <div className="success-icon">✅</div>
          <h2>Patient Registered Successfully!</h2>
          <p>Patient Number: {formData.patient_number}</p>
          <p>{formData.first_name} {formData.last_name} has been added to the system.</p>
          {isNewPatient && formData.next_pickup_date && (
            <p style={{ color: '#3b82f6', fontWeight: 600 }}>
              📅 First Pickup: {new Date(formData.next_pickup_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
            </p>
          )}
          {!isNewPatient && getAutoPickupPreview() && (
            <p style={{ color: '#3b82f6', fontWeight: 600 }}>
              📅 Next Pickup Scheduled: {getAutoPickupPreview()}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="form-overlay" onClick={onClose}>
      <div className="form-modal" onClick={(e) => e.stopPropagation()}>

        <div className="form-header">
          <h2>Register New Patient</h2>
          <button className="close-button" onClick={onClose}>✕</button>
        </div>

        {error && (
          <div className="form-error">
            <span>⚠️</span> {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="patient-form">

          {/* ── Patient Identification ── */}
          <div className="form-section">
            <h3 className="section-title">Patient Identification</h3>
            <div className="form-row">
              <div className="form-group">
                <label>Patient Number <span className="required">*</span></label>
                <input type="text" name="patient_number" value={formData.patient_number}
                  onChange={handleChange} readOnly style={{ backgroundColor: '#f3f4f6' }} required />
                <small style={{ color: '#6b7280', fontSize: '0.75rem' }}>Auto-generated unique identifier</small>
              </div>
              <div className="form-group">
                <label>Enrollment Date <span className="required">*</span></label>
                <input type="date" name="enrollment_date" value={formData.enrollment_date}
                  onChange={handleChange} required />
              </div>
            </div>
          </div>

          {/* ── Personal Information ── */}
          <div className="form-section">
            <h3 className="section-title">Personal Information</h3>
            <div className="form-row">
              <div className="form-group">
                <label>First Name <span className="required">*</span></label>
                <input type="text" name="first_name" value={formData.first_name}
                  onChange={handleChange} placeholder="Enter first name" required />
              </div>
              <div className="form-group">
                <label>Last Name <span className="required">*</span></label>
                <input type="text" name="last_name" value={formData.last_name}
                  onChange={handleChange} placeholder="Enter last name" required />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Date of Birth <span className="required">*</span></label>
                <input type="date" name="date_of_birth" value={formData.date_of_birth}
                  onChange={handleChange} max={new Date().toISOString().split('T')[0]} required />
              </div>
              <div className="form-group">
                <label>Gender <span className="required">*</span></label>
                <select name="gender" value={formData.gender} onChange={handleChange} required>
                  <option value="">Select gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Phone Number <span className="required">*</span></label>
                <input type="tel" name="phone_number" value={formData.phone_number}
                  onChange={handleChange} placeholder="+263 77 123 4567" required />
              </div>
              <div className="form-group">
                <label>Alternative Phone (Optional)</label>
                <input type="tel" name="alternative_phone" value={formData.alternative_phone}
                  onChange={handleChange} placeholder="+263 71 234 5678" />
              </div>
            </div>
            <div className="form-group">
              <label>Email Address (Optional)</label>
              <input type="email" name="email" value={formData.email}
                onChange={handleChange} placeholder="patient@example.com" />
              <small style={{ color: '#6b7280', fontSize: '0.75rem' }}>
                Used for appointment reminders and notifications
              </small>
            </div>
          </div>

          {/* ── Address Information ── */}
          <div className="form-section">
            <h3 className="section-title">Address Information</h3>
            <div className="form-group">
              <label>Address</label>
              <input type="text" name="address" value={formData.address}
                onChange={handleChange} placeholder="Street address" />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>City</label>
                <input type="text" name="city" value={formData.city}
                  onChange={handleChange} placeholder="City" />
              </div>
              <div className="form-group">
                <label>Distance from Clinic (km)</label>
                <input type="number" name="distance_from_clinic" value={formData.distance_from_clinic}
                  onChange={handleChange} placeholder="e.g., 5" min="0" step="0.1" />
              </div>
            </div>
          </div>

          {/* ── Medical Information ── */}
          <div className="form-section">
            <h3 className="section-title">Medical Information</h3>
            <div className="form-group">
              <label>ARV Regimen</label>
              <select name="arv_regimen" value={formData.arv_regimen} onChange={handleChange}>
                <option value="">Select ARV regimen (optional)</option>
                <option value="TDF/3TC/EFV">TDF/3TC/EFV (Tenofovir/Lamivudine/Efavirenz)</option>
                <option value="TDF/3TC/DTG">TDF/3TC/DTG (Tenofovir/Lamivudine/Dolutegravir)</option>
                <option value="ABC/3TC/DTG">ABC/3TC/DTG (Abacavir/Lamivudine/Dolutegravir)</option>
                <option value="AZT/3TC/NVP">AZT/3TC/NVP (Zidovudine/Lamivudine/Nevirapine)</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          {/* ── Pickup Schedule ── */}
          <div className="form-section">
            <h3 className="section-title">📅 Medication Pickup Schedule</h3>

            {/* Patient Type Toggle */}
            <div className="patient-type-toggle">
              <button type="button"
                className={`toggle-btn ${isNewPatient ? 'active' : ''}`}
                onClick={() => setIsNewPatient(true)}>
                🆕 First-Time Patient
              </button>
              <button type="button"
                className={`toggle-btn ${!isNewPatient ? 'active' : ''}`}
                onClick={() => setIsNewPatient(false)}>
                🔄 Returning / Transfer Patient
              </button>
            </div>

            <div className="toggle-hint">
              {isNewPatient
                ? '⚠️ New patient — please enter their first pickup date manually below.'
                : '✅ Returning patient — pickup date will be auto-calculated from enrollment date + frequency.'}
            </div>

            <div className="form-row" style={{ marginTop: '1rem' }}>
              <div className="form-group">
                <label>Pickup Frequency <span className="required">*</span></label>
                <select name="pickup_frequency" value={formData.pickup_frequency} onChange={handleChange} required>
                  <option value="30">Every 30 days (Monthly)</option>
                  <option value="60">Every 60 days (2 Months)</option>
                  <option value="90">Every 90 days (3 Months)</option>
                  <option value="14">Every 14 days (Fortnightly)</option>
                  <option value="7">Every 7 days (Weekly)</option>
                </select>
                <small style={{ color: '#6b7280', fontSize: '0.75rem' }}>
                  How often the patient collects medication
                </small>
              </div>

              {isNewPatient ? (
                <div className="form-group">
                  <label>First Pickup Date <span className="required">*</span></label>
                  <input
                    type="date"
                    name="next_pickup_date"
                    value={formData.next_pickup_date}
                    onChange={handleChange}
                    min={new Date().toISOString().split('T')[0]}
                    required
                    style={{ border: '2px solid #3b82f6' }}
                  />
                  <small style={{ color: '#3b82f6', fontSize: '0.75rem' }}>
                    Enter the date agreed with the patient
                  </small>
                </div>
              ) : (
                <div className="form-group">
                  <label>First Pickup Date (Auto-Calculated)</label>
                  <input type="text"
                    value={getAutoPickupPreview() || 'Set enrollment date first'}
                    readOnly
                    style={{ backgroundColor: '#f0fdf4', color: '#166534', fontWeight: 600, border: '2px solid #bbf7d0' }}
                  />
                  <small style={{ color: '#166534', fontSize: '0.75rem' }}>
                    Enrollment date + {formData.pickup_frequency} days
                  </small>
                </div>
              )}
            </div>
          </div>

          {/* ── Emergency Contact ── */}
          <div className="form-section">
            <h3 className="section-title">Emergency Contact (Optional)</h3>
            <div className="form-row">
              <div className="form-group">
                <label>Emergency Contact Name</label>
                <input type="text" name="emergency_contact_name" value={formData.emergency_contact_name}
                  onChange={handleChange} placeholder="Contact person name" />
              </div>
              <div className="form-group">
                <label>Emergency Contact Phone</label>
                <input type="tel" name="emergency_contact_phone" value={formData.emergency_contact_phone}
                  onChange={handleChange} placeholder="+263 77 123 4567" />
              </div>
            </div>
          </div>

          {/* ── Form Actions ── */}
          <div className="form-actions">
            <button type="button" className="cancel-button" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="submit-button" disabled={loading}>
              {loading ? (<><span className="spinner-small"></span>Registering...</>) : 'Register Patient'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}

export default PatientForm;