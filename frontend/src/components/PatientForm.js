import React, { useState, useEffect } from 'react';
import './PatientForm.css';
import { patientsAPI } from '../services/api';
import { useNotifications } from '../contexts/NotificationContext';

function PatientForm({ onClose, onSuccess, currentUser = null }) {
  const { showToast, addNotification } = useNotifications();

  const isNurse = currentUser?.role === 'healthcare_worker';

  const [formData, setFormData] = useState({
    patient_number:           '',
    first_name:               '',
    last_name:                '',
    date_of_birth:            '',
    gender:                   '',
    enrollment_date:          '',
    phone_number:             '',
    alternative_phone:        '',
    email:                    '',
    district:                 '',
    ward:                     '',
    village:                  '',
    headman:                  '',
    distance_from_clinic:     '',
    arv_regimen:              '',
    pickup_frequency:         '30',
    next_pickup_date:         '',
    next_of_kin_name:         '',
    next_of_kin_relationship: '',
    next_of_kin_phone:        '',
    next_of_kin_address:      '',
    has_hypertension:         false,
    has_diabetes:             false,
    has_tuberculosis:         false,
    has_mental_health:        false,
    has_kidney_disease:       false,
    other_chronic_condition:  '',
    risk_notes:               '',
    clinic_number:            '',
    nurse_number:             '',
    dispensing_clinic:        '',
    // ── NEW ML FIELDS ─────────────────────────────────────────────
    marital_status:           '',
    treatment_supporter:      false,
    who_clinical_stage:       '2',
    art_start_date:           '',
  });

  const [isNewPatient, setIsNewPatient] = useState(true);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState(null);
  const [success, setSuccess]           = useState(false);

  const generatePatientNumber = () => {
    return 'P' + Math.floor(10000 + Math.random() * 90000);
  };

  useEffect(() => {
    setFormData(prev => ({
      ...prev,
      patient_number:    generatePatientNumber(),
      enrollment_date:   new Date().toISOString().split('T')[0],
      art_start_date:    new Date().toISOString().split('T')[0],
      clinic_number:     isNurse ? (currentUser?.clinic_number || '') : '',
      nurse_number:      isNurse ? (currentUser?.nurse_number  || '') : '',
      dispensing_clinic: isNurse ? (currentUser?.clinic_name   || '') : ''
    }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;

    if (type === 'checkbox') {
      setFormData(prev => ({ ...prev, [name]: checked }));
      return;
    }

    const lettersOnly     = /^[a-zA-Z\s\-'.]*$/;
    const wholeNumberOnly = /^\d*$/;
    const phoneChars      = /^[\+\d\s\-\(\)]*$/;

    const letterFields   = ['first_name', 'last_name', 'district', 'village', 'headman', 'next_of_kin_name'];
    const wholeNumFields = ['ward', 'distance_from_clinic'];
    const phoneFields    = ['phone_number', 'alternative_phone', 'next_of_kin_phone'];

    if (letterFields.includes(name)   && !lettersOnly.test(value))     return;
    if (wholeNumFields.includes(name) && !wholeNumberOnly.test(value)) return;
    if (phoneFields.includes(name)    && !phoneChars.test(value))      return;

    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleDobBlur = (e) => {
    const value = e.target.value;
    if (!value) return;
    const year = parseInt(value.split('-')[0], 10);
    if (isNaN(year) || year < 1947 || year > 2018) {
      setFormData(prev => ({ ...prev, date_of_birth: '' }));
      setError('Date of birth must be between 1947 and 2018.');
    } else {
      setError(null);
    }
  };


  const getAutoPickupPreview = () => {
    if (!formData.enrollment_date || !formData.pickup_frequency) return null;
    const d = new Date(formData.enrollment_date);
    d.setDate(d.getDate() + parseInt(formData.pickup_frequency));
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const validateForm = () => {
    const fail = (msg) => { setError(msg); return msg; };
    const lettersOnly = /^[a-zA-Z\s\-'.]+$/;
    const phoneRegex  = /^[\+]?[0-9\s\-\(\)]+$/;
    const wholeNum    = /^\d+$/;

    if (!formData.patient_number)                    return fail('Patient number is required');
    if (!formData.first_name || !formData.last_name) return fail('First and last name are required');
    if (!lettersOnly.test(formData.first_name))      return fail('First name must contain letters only');
    if (!lettersOnly.test(formData.last_name))       return fail('Last name must contain letters only');
    if (!formData.date_of_birth)                     return fail('Date of birth is required');

    const dobYear = new Date(formData.date_of_birth).getFullYear();
    if (dobYear < 1947 || dobYear > 2018)            return fail('Date of birth must be between 1947 and 2018');
    if (new Date(formData.date_of_birth) >= new Date()) return fail('Date of birth must be in the past');

    if (!formData.gender)          return fail('Gender is required');
    if (!formData.enrollment_date) return fail('Enrollment date is required');
    if (!formData.phone_number)    return fail('Phone number is required');
    if (!phoneRegex.test(formData.phone_number)) return fail('Phone number must contain numbers only');

    if (formData.alternative_phone && !phoneRegex.test(formData.alternative_phone))
      return fail('Alternative phone must contain numbers only');
    if (formData.ward && !wholeNum.test(formData.ward))
      return fail('Ward must be a whole number (e.g. 14)');
    if (formData.distance_from_clinic && !wholeNum.test(formData.distance_from_clinic))
      return fail('Distance must be a whole number');
    if (formData.district && !lettersOnly.test(formData.district))
      return fail('District must contain letters only');
    if (formData.village && !lettersOnly.test(formData.village))
      return fail('Village must contain letters only');
    if (formData.headman && !lettersOnly.test(formData.headman))
      return fail('Headman name must contain letters only');

    if (!formData.clinic_number) return fail('Clinic Number is required');
    if (!formData.nurse_number)  return fail('Nurse Number is required');

    if (formData.email) {
      const emailR = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailR.test(formData.email)) return fail('Please enter a valid email address');
    }

    if (!formData.next_of_kin_name)                   return fail('Next of Kin name is required');
    if (!lettersOnly.test(formData.next_of_kin_name)) return fail('Next of Kin name must contain letters only');
    if (!formData.next_of_kin_relationship)           return fail('Next of Kin relationship is required');
    if (!formData.next_of_kin_phone)                  return fail('Next of Kin phone number is required');
    if (!phoneRegex.test(formData.next_of_kin_phone)) return fail('Next of Kin phone must contain numbers only');
    if (isNewPatient && !formData.next_pickup_date)   return fail('Please enter the first pickup date');

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
      const conditions = [];
      if (formData.has_hypertension) conditions.push('Hypertension');
      if (formData.has_diabetes) conditions.push('Diabetes');
      if (formData.has_tuberculosis) conditions.push('Tuberculosis');
      if (formData.has_mental_health) conditions.push('Mental Health Condition');
      if (formData.has_kidney_disease) conditions.push('Kidney Disease');
      if (formData.other_chronic_condition) conditions.push(formData.other_chronic_condition.trim());

      const chronic_diseases_string = conditions.join(', ');

      await patientsAPI.createPatient({
        ...formData,
        is_new_patient:          isNewPatient,
        emergency_contact_name:  formData.next_of_kin_name,
        emergency_contact_phone: formData.next_of_kin_phone,
        chronic_diseases:        chronic_diseases_string,
        marital_status:          formData.marital_status,
        treatment_supporter:     formData.treatment_supporter,
        who_clinical_stage:      parseInt(formData.who_clinical_stage) || 2,
        art_start_date:          formData.art_start_date || formData.enrollment_date,
      });

      setSuccess(true);
      const name = formData.first_name + ' ' + formData.last_name;
      showToast({ type: 'success', message: name + ' added successfully', duration: 5000 });
      addNotification({
        type: 'patient', title: 'New Patient Registered',
        message: name + ' (' + formData.patient_number + ') enrolled',
        showToast: false
      });
      setTimeout(async () => {
        if (onSuccess) await onSuccess();
        if (onClose)   onClose();
      }, 1500);
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to register patient.';
      setError(msg);
      setLoading(false);
      showToast({ type: 'error', message: msg, duration: 5000 });
    }
  };


  const lockedStyle = {
    backgroundColor: '#f0fdf4', color: '#166534',
    fontWeight: '600', border: '2px solid #bbf7d0', cursor: 'not-allowed'
  };
  const lockedHint = {
    color: '#166534', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block'
  };

  if (success) {
    return (
      <div className="form-overlay">
        <div className="form-modal success-modal">
          <div className="success-icon">✅</div>
          <h2>Patient Registered Successfully!</h2>
          <p>Patient Number: <strong>{formData.patient_number}</strong></p>
          <p>{formData.first_name} {formData.last_name} has been added to the system.</p>
          {isNewPatient && formData.next_pickup_date && (
            <p style={{ color: '#3b82f6', fontWeight: 600 }}>
              📅 First Pickup:{' '}
              {new Date(formData.next_pickup_date).toLocaleDateString('en-GB', {
                day: '2-digit', month: 'short', year: 'numeric'
              })}
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
      <div className="form-modal" onClick={e => e.stopPropagation()}>

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
                <small style={{ color: '#6b7280', fontSize: '0.75rem' }}>
                  Auto-generated — format P + 5 digits
                </small>
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
                  onChange={handleChange} onBlur={handleDobBlur}
                  min="1947-01-01" max="2018-12-31" required />
                <small style={{ color: '#6b7280', fontSize: '0.75rem' }}>Range: 1947 — 2018</small>
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

            {/* ── NEW: Marital Status ── */}
            <div className="form-row">
              <div className="form-group">
                <label>Marital Status</label>
                <select name="marital_status" value={formData.marital_status} onChange={handleChange}>
                  <option value="">Select marital status</option>
                  <option value="Single">Single</option>
                  <option value="Married">Married</option>
                  <option value="Divorced">Divorced</option>
                  <option value="Widowed">Widowed</option>
                </select>
                <small style={{ color: '#6b7280', fontSize: '0.75rem' }}>
                  Used in ML risk prediction
                </small>
              </div>
              <div className="form-group">
                <label>ART Start Date</label>
                <input type="date" name="art_start_date" value={formData.art_start_date}
                  onChange={handleChange} />
                <small style={{ color: '#6b7280', fontSize: '0.75rem' }}>
                  Date patient started ART (defaults to enrollment date)
                </small>
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
            </div>
          </div>

          {/* ── Rural Location ── */}
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
                  onChange={handleChange} placeholder="e.g. 14" />
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
                onChange={handleChange} placeholder="e.g. 5" min="0" step="1" />
            </div>
          </div>

          {/* ── Next of Kin ── */}
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
                <select name="next_of_kin_relationship" value={formData.next_of_kin_relationship}
                  onChange={handleChange} required>
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

            <div className="form-row">
              <div className="form-group">
                <label>ARV Regimen</label>
                <select name="arv_regimen" value={formData.arv_regimen} onChange={handleChange}>
                  <option value="">Select ARV regimen (optional)</option>
                  <option value="TDF/3TC/EFV">TDF/3TC/EFV (Tenofovir/Lamivudine/Efavirenz)</option>
                  <option value="TLD">TLD / TDF/3TC/DTG (Tenofovir/Lamivudine/Dolutegravir)</option>
                  <option value="ABC/3TC/DTG">ABC/3TC/DTG (Abacavir/Lamivudine/Dolutegravir)</option>
                  <option value="AZT/3TC/NVP">AZT/3TC/NVP (Zidovudine/Lamivudine/Nevirapine)</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              {/* ── NEW: WHO Clinical Stage ── */}
              <div className="form-group">
                <label>WHO Clinical Stage</label>
                <select name="who_clinical_stage" value={formData.who_clinical_stage} onChange={handleChange}>
                  <option value="1">Stage 1 — Asymptomatic</option>
                  <option value="2">Stage 2 — Mild Symptoms</option>
                  <option value="3">Stage 3 — Advanced</option>
                  <option value="4">Stage 4 — Severe / AIDS</option>
                </select>
                <small style={{ color: '#6b7280', fontSize: '0.75rem' }}>
                  Clinical stage at ART initiation
                </small>
              </div>
            </div>

            {/* ── NEW: Treatment Supporter ── */}
            <div className="form-group" style={{ marginTop: '0.5rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  name="treatment_supporter"
                  checked={formData.treatment_supporter}
                  onChange={handleChange}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <span style={{ fontWeight: 600 }}>
                  🤝 Patient has a Treatment Supporter
                </span>
              </label>
              <small style={{ color: '#6b7280', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
                A treatment supporter is a trusted person (spouse, parent, neighbour) who reminds the patient
                to collect medication and accompany them to clinic. Required by Zimbabwe MOHCC policy.
              </small>
            </div>

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
                    <input type="checkbox" name={name}
                      checked={formData[name]} onChange={handleChange} />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
              <div className="form-group" style={{ marginTop: '0.75rem' }}>
                <label>Other Chronic Condition</label>
                <input type="text" name="other_chronic_condition"
                  value={formData.other_chronic_condition} onChange={handleChange}
                  placeholder="Specify any other chronic condition" />
              </div>
            </div>
            <div className="form-group" style={{ marginTop: '1rem' }}>
              <label>Additional Risk Notes</label>
              <textarea name="risk_notes" value={formData.risk_notes} onChange={handleChange}
                rows="2"
                placeholder="Any other relevant risk information observed by the nurse..." />
            </div>
          </div>

          {/* ── Registration Clinic Details ── */}
          <div className="form-section">
            <h3 className="section-title">🏥 Registration Clinic Details</h3>

            {isNurse && (
              <div style={{
                background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px',
                padding: '0.6rem 1rem', marginBottom: '1rem',
                fontSize: '0.82rem', color: '#166534'
              }}>
                ✅ Logged in as <strong>{currentUser.full_name}</strong> —
                clinic details and nurse number auto-filled from your account.
              </div>
            )}

            <div className="form-row">
              <div className="form-group">
                <label>Clinic Number <span className="required">*</span></label>
                {isNurse ? (
                  <>
                    <input type="text" value={formData.clinic_number} readOnly style={lockedStyle} />
                    <small style={lockedHint}>Auto-filled from your account</small>
                  </>
                ) : (
                  <>
                    <input type="text" name="clinic_number" value={formData.clinic_number}
                      onChange={handleChange} placeholder="e.g. CLN-001" required />
                    <small style={{ color: '#6b7280', fontSize: '0.75rem' }}>
                      Patient can use this at any clinic
                    </small>
                  </>
                )}
              </div>
              <div className="form-group">
                <label>Nurse Number <span className="required">*</span></label>
                {isNurse ? (
                  <>
                    <input type="text" value={formData.nurse_number} readOnly style={lockedStyle} />
                    <small style={lockedHint}>Auto-filled from your account</small>
                  </>
                ) : (
                  <>
                    <input type="text" name="nurse_number" value={formData.nurse_number}
                      onChange={handleChange} placeholder="e.g. NRS-045" required />
                    <small style={{ color: '#6b7280', fontSize: '0.75rem' }}>
                      Enter the registering nurse's number
                    </small>
                  </>
                )}
              </div>
            </div>

            <div className="form-group">
              <label>Dispensing Clinic Name {!isNurse && '(Optional)'}</label>
              {isNurse ? (
                <>
                  <input type="text" value={formData.dispensing_clinic} readOnly style={lockedStyle} />
                  <small style={lockedHint}>Auto-filled from your account</small>
                </>
              ) : (
                <>
                  <input type="text" name="dispensing_clinic" value={formData.dispensing_clinic}
                    onChange={handleChange} placeholder="e.g. Chinyamukwakwa Clinic, Chipinge" />
                  <small style={{ color: '#6b7280', fontSize: '0.75rem' }}>
                    Name of the registering clinic
                  </small>
                </>
              )}
            </div>
          </div>

          {/* ── Pickup Schedule ── */}
          <div className="form-section">
            <h3 className="section-title">📅 Medication Pickup Schedule</h3>
            <div className="patient-type-toggle">
              <button type="button"
                className={'toggle-btn' + (isNewPatient ? ' active' : '')}
                onClick={() => setIsNewPatient(true)}>
                🆕 First-Time Patient
              </button>
              <button type="button"
                className={'toggle-btn' + (!isNewPatient ? ' active' : '')}
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
                <select name="pickup_frequency" value={formData.pickup_frequency}
                  onChange={handleChange} required>
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
                    onChange={handleChange}
                    min={new Date().toISOString().split('T')[0]}
                    required style={{ border: '2px solid #3b82f6' }} />
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
                    style={{
                      backgroundColor: '#f0fdf4', color: '#166534',
                      fontWeight: 600, border: '2px solid #bbf7d0'
                    }}
                  />
                  <small style={{ color: '#166534', fontSize: '0.75rem' }}>
                    Enrollment date + {formData.pickup_frequency} days
                  </small>
                </div>
              )}
            </div>
          </div>

          {/* ── Actions ── */}
          <div className="form-actions">
            <button type="button" className="cancel-button"
              onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="submit-button" disabled={loading}>
              {loading
                ? (<><span className="spinner-small"></span>Registering...</>)
                : 'Register Patient'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}

export default PatientForm;