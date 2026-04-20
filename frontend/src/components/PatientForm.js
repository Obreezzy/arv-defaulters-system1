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
    district: '',
    ward: '',
    village: '',
    headman: '',
    distance_from_clinic: '',
    arv_regimen: '',
    pickup_frequency: '30',
    next_pickup_date: '',
    next_of_kin_name: '',
    next_of_kin_relationship: '',
    next_of_kin_phone: '',
    next_of_kin_address: '',
    has_hypertension: false,
    has_diabetes: false,
    has_tuberculosis: false,
    has_mental_health: false,
    has_kidney_disease: false,
    other_chronic_condition: '',
    risk_notes: '',
    // ✅ NEW CLINIC FIELDS ADDED HERE
    clinic_number: '',
    nurse_number: '',
    dispensing_clinic: ''
  });

  const [isNewPatient, setIsNewPatient] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [success, setSuccess] = useState(false);

  useState(() => {
    const patientNumber = 'P' + Date.now().toString().slice(-8);
    setFormData(prev => ({
      ...prev,
      patient_number: patientNumber,
      enrollment_date: new Date().toISOString().split('T')[0]
    }));
  }, []);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;

    if (type === 'checkbox') {
      setFormData(prev => ({ ...prev, [name]: checked }));
      return;
    }

    // Letters only (allow spaces, hyphens, apostrophes for names/places)
    const lettersOnly    = /^[a-zA-Z\s\-'.]*$/;
    // Whole numbers only
    const wholeNumberOnly = /^\d*$/;
    // Phone: digits, +, spaces, hyphens, parentheses
    const phoneChars     = /^[\+\d\s\-\(\)]*$/;

    const letterFields   = ['first_name', 'last_name', 'district', 'village', 'headman', 'next_of_kin_name'];
    const wholeNumFields = ['ward', 'distance_from_clinic'];
    const phoneFields    = ['phone_number', 'alternative_phone', 'next_of_kin_phone'];

    if (letterFields.includes(name)   && !lettersOnly.test(value))    return;
    if (wholeNumFields.includes(name) && !wholeNumberOnly.test(value)) return;
    if (phoneFields.includes(name)    && !phoneChars.test(value))      return;

    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const calculateLiveRisk = () => {
    let score = 0;
    const distance = parseFloat(formData.distance_from_clinic) || 0;
    const age = formData.date_of_birth
      ? new Date().getFullYear() - new Date(formData.date_of_birth).getFullYear()
      : 0;

    if (distance > 25)      score += 30;
    else if (distance > 15) score += 15;

    if (age >= 18 && age <= 24) score += 20;
    else if (age > 70)          score += 10;

    if (formData.has_hypertension)   score += 10;
    if (formData.has_diabetes)       score += 10;
    if (formData.has_tuberculosis)   score += 15;
    if (formData.has_mental_health)  score += 15;
    if (formData.has_kidney_disease) score += 10;
    if (formData.other_chronic_condition) score += 5;

    score = Math.min(score, 100);
    const label = score >= 50 ? 'High' : score >= 25 ? 'Medium' : 'Low';
    const color = score >= 50 ? '#ef4444' : score >= 25 ? '#f97316' : '#10b981';
    return { score, label, color };
  };

  const getAutoPickupPreview = () => {
    if (!formData.enrollment_date || !formData.pickup_frequency) return null;
    const enroll = new Date(formData.enrollment_date);
    enroll.setDate(enroll.getDate() + parseInt(formData.pickup_frequency));
    return enroll.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const validateForm = () => {
    const fail = (msg) => { setError(msg); return msg; };

    const lettersOnly    = /^[a-zA-Z\s\-'.]+$/;
    const wholeNumberOnly = /^\d+$/;
    const phoneRegex     = /^[\+]?[0-9\s\-\(\)]+$/;

    if (!formData.patient_number)                    return fail('Patient number is required');
    if (!formData.first_name || !formData.last_name) return fail('First and last name are required');
    if (!lettersOnly.test(formData.first_name))      return fail('First name must contain letters only');
    if (!lettersOnly.test(formData.last_name))       return fail('Last name must contain letters only');
    if (!formData.date_of_birth)                     return fail('Date of birth is required');
    if (!formData.gender)                            return fail('Gender is required');
    if (!formData.enrollment_date)                   return fail('Enrollment date is required');
    if (!formData.phone_number)                      return fail('Phone number is required');
    if (!phoneRegex.test(formData.phone_number))     return fail('Phone number must contain numbers only');

    if (formData.alternative_phone && !phoneRegex.test(formData.alternative_phone))
      return fail('Alternative phone must contain numbers only');
    if (formData.ward && !wholeNumberOnly.test(formData.ward))
      return fail('Ward must be a whole number (e.g. 14)');
    if (formData.distance_from_clinic && !wholeNumberOnly.test(formData.distance_from_clinic))
      return fail('Distance from clinic must be a whole number');
    if (formData.district && !lettersOnly.test(formData.district))
      return fail('District must contain letters only');
    if (formData.village && !lettersOnly.test(formData.village))
      return fail('Village must contain letters only');
    if (formData.headman && !lettersOnly.test(formData.headman))
      return fail('Headman name must contain letters only');

    if (!formData.clinic_number) return fail('Clinic Number is required');
    if (!formData.nurse_number)  return fail('Nurse Number is required');

    if (formData.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.email)) return fail('Please enter a valid email address');
    }
    if (new Date(formData.date_of_birth) >= new Date()) return fail('Date of birth must be in the past');
    if (new Date(formData.date_of_birth) < new Date('1946-01-01')) return fail('Date of birth cannot be before 1946 — please check the year entered');

    if (!formData.next_of_kin_name)         return fail('Next of Kin name is required');
    if (!lettersOnly.test(formData.next_of_kin_name)) return fail('Next of Kin name must contain letters only');
    if (!formData.next_of_kin_relationship) return fail('Next of Kin relationship is required');
    if (!formData.next_of_kin_phone)        return fail('Next of Kin phone number is required');
    if (!phoneRegex.test(formData.next_of_kin_phone)) return fail('Next of Kin phone must contain numbers only');
    if (isNewPatient && !formData.next_pickup_date) return fail('Please enter the first pickup date for this new patient');

    setError(null);
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validationError = validateForm();
    if (validationError) {
      showToast({ type: 'error', message: validationError, duration: 4000 });
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const payload = {
        ...formData,
        is_new_patient: isNewPatient,
        emergency_contact_name: formData.next_of_kin_name,
        emergency_contact_phone: formData.next_of_kin_phone,
      };

      await patientsAPI.createPatient(payload);
      setSuccess(true);

      const patientName = `${formData.first_name} ${formData.last_name}`;
      showToast({ type: 'success', message: `${patientName} added successfully`, duration: 5000 });
      addNotification({ type: 'patient', title: 'New Patient Registered', message: `${patientName} (${formData.patient_number}) enrolled`, showToast: false });

      setTimeout(async () => {
        if (onSuccess) await onSuccess();
        if (onClose)   onClose();
      }, 1500);

    } catch (err) {
      const errorMessage = err.response?.data?.message || 'Failed to register patient.';
      setError(errorMessage);
      setLoading(false);
      showToast({ type: 'error', message: errorMessage, duration: 5000 });
    }
  };

  const risk = calculateLiveRisk();

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
          <div className="form-error"><span>⚠️</span> {error}</div>
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
                  onChange={handleChange} min="1946-01-01" max={new Date().toISOString().split('T')[0]} required />
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

          {/* ── Rural Location Information ── */}
          <div className="form-section">
            <h3 className="section-title">Rural Location Information</h3>
            <div className="form-row">
              <div className="form-group">
                <label>District</label>
                <input type="text" name="district" value={formData.district}
                  onChange={handleChange} placeholder="e.g. Mutasa" />
              </div>
              <div className="form-group">
                <label>Ward</label>
                <input type="text" name="ward" value={formData.ward}
                  onChange={handleChange} placeholder="e.g. Ward 14" />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Village</label>
                <input type="text" name="village" value={formData.village}
                  onChange={handleChange} placeholder="e.g. Chigodora" />
              </div>
              <div className="form-group">
                <label>Headman / Sabhuku</label>
                <input type="text" name="headman" value={formData.headman}
                  onChange={handleChange} placeholder="e.g. Sabhuku Muchabaiwa" />
              </div>
            </div>
            <div className="form-group">
              <label>Distance from Clinic (km)</label>
              <input type="number" name="distance_from_clinic" value={formData.distance_from_clinic}
                onChange={handleChange} placeholder="e.g., 5" min="0" step="1" />
            </div>
          </div>

          {/* ── Next of Kin (Mandatory) ── */}
          <div className="form-section">
            <h3 className="section-title">Next of Kin Details <span className="required">*</span></h3>
            <p style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: '1rem' }}>
              All next of kin fields are required for emergency contact purposes.
            </p>
            <div className="form-row">
              <div className="form-group">
                <label>Full Name <span className="required">*</span></label>
                <input type="text" name="next_of_kin_name" value={formData.next_of_kin_name}
                  onChange={handleChange} placeholder="Next of kin full name" required />
              </div>
              <div className="form-group">
                <label>Relationship <span className="required">*</span></label>
                <select name="next_of_kin_relationship" value={formData.next_of_kin_relationship} onChange={handleChange} required>
                  <option value="">Select relationship</option>
                  <option value="Spouse">Spouse</option>
                  <option value="Parent">Parent</option>
                  <option value="Child">Child</option>
                  <option value="Sibling">Sibling</option>
                  <option value="Guardian">Guardian</option>
                  <option value="Friend">Friend</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Phone Number <span className="required">*</span></label>
                <input type="tel" name="next_of_kin_phone" value={formData.next_of_kin_phone}
                  onChange={handleChange} placeholder="+263 77 123 4567" required />
              </div>
              <div className="form-group">
                <label>Address / Village (Optional)</label>
                <input type="text" name="next_of_kin_address" value={formData.next_of_kin_address}
                  onChange={handleChange} placeholder="Next of kin location" />
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

            {/* Chronic Conditions */}
            <div className="form-group" style={{ marginTop: '1rem' }}>
              <label style={{ marginBottom: '0.75rem', display: 'block', fontWeight: 600 }}>
                Chronic Conditions (tick all that apply)
              </label>
              <div className="checkbox-grid">
                {[
                  { name: 'has_hypertension',  label: '❤️ Hypertension' },
                  { name: 'has_diabetes',       label: '🩸 Diabetes' },
                  { name: 'has_tuberculosis',   label: '🫁 Tuberculosis (TB)' },
                  { name: 'has_mental_health',  label: '🧠 Mental Health Condition' },
                  { name: 'has_kidney_disease', label: '🫘 Kidney Disease' },
                ].map(({ name, label }) => (
                  <label key={name} className="checkbox-label">
                    <input type="checkbox" name={name} checked={formData[name]} onChange={handleChange} />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
              <div className="form-group" style={{ marginTop: '0.75rem' }}>
                <label>Other Chronic Condition</label>
                <input type="text" name="other_chronic_condition" value={formData.other_chronic_condition}
                  onChange={handleChange} placeholder="Specify any other chronic condition" />
              </div>
            </div>

            {/* ── Live AI Risk Score Bar ── */}
            <div className="risk-preview-bar">
              <div className="risk-preview-header">
                <span className="risk-preview-title">🔮 AI Risk Score Preview</span>
                <span className="risk-preview-badge" style={{ backgroundColor: risk.color }}>
                  {risk.label} Risk
                </span>
              </div>
              <div className="risk-preview-track">
                <div className="risk-preview-fill" style={{ width: `${risk.score}%`, backgroundColor: risk.color }} />
              </div>
              <div className="risk-preview-footer">
                <span style={{ color: '#6b7280', fontSize: '0.75rem' }}>
                  Based on distance, age & chronic conditions. Pickup history adds more weight after registration.
                </span>
                <span className="risk-preview-score" style={{ color: risk.color }}>{risk.score}%</span>
              </div>
            </div>

            <div className="form-group" style={{ marginTop: '1rem' }}>
              <label>Additional Risk Notes</label>
              <textarea name="risk_notes" value={formData.risk_notes} onChange={handleChange}
                rows="2" placeholder="Any other relevant risk information observed by the nurse..." />
            </div>
          </div>

          {/* ── Registration Clinic Details ── */}
          <div className="form-section">
            <h3 className="section-title">🏥 Registration Clinic Details</h3>
            <div className="form-row">
              <div className="form-group">
                <label>Clinic Number <span className="required">*</span></label>
                <input type="text" name="clinic_number" value={formData.clinic_number}
                  onChange={handleChange} placeholder="e.g. CLN-001" required />
                <small style={{ color: '#6b7280', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
                  Patient can use this at any clinic
                </small>
              </div>
              <div className="form-group">
                <label>Nurse Number <span className="required">*</span></label>
                <input type="text" name="nurse_number" value={formData.nurse_number}
                  onChange={handleChange} placeholder="e.g. NRS-045" required />
                <small style={{ color: '#6b7280', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
                  Nurse registering the patient
                </small>
              </div>
            </div>
            <div className="form-group">
              <label>Dispensing Clinic Name (Optional)</label>
              <input type="text" name="dispensing_clinic" value={formData.dispensing_clinic}
                onChange={handleChange} placeholder="e.g. Sakubva Clinic, Mutare" />
              <small style={{ color: '#6b7280', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
                Name of the registering clinic
              </small>
            </div>
          </div>

          {/* ── Pickup Schedule ── */}
          <div className="form-section">
            <h3 className="section-title">📅 Medication Pickup Schedule</h3>
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
              </div>
              {isNewPatient ? (
                <div className="form-group">
                  <label>First Pickup Date <span className="required">*</span></label>
                  <input type="date" name="next_pickup_date" value={formData.next_pickup_date}
                    onChange={handleChange} min={new Date().toISOString().split('T')[0]}
                    required style={{ border: '2px solid #3b82f6' }} />
                  <small style={{ color: '#3b82f6', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
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
                  <small style={{ color: '#166534', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
                    Enrollment date + {formData.pickup_frequency} days
                  </small>
                </div>
              )}
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