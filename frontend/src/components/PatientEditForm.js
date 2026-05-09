import React, { useState } from 'react';
import './PatientForm.css';
import { patientsAPI } from '../services/api';
import { useNotifications } from '../contexts/NotificationContext';

function PatientEditForm({ patient, onClose, onSuccess }) {
  const { showToast, addNotification } = useNotifications();

  // Parse existing chronic diseases
  const chronicsStr = (patient.chronic_diseases || '').toLowerCase();
  let otherStr = patient.chronic_diseases || '';
  ['Hypertension', 'Diabetes', 'Tuberculosis', 'Mental Health Condition', 'Kidney Disease'].forEach(c => {
    const regex = new RegExp(c + ',?\\s*', 'gi');
    otherStr = otherStr.replace(regex, '');
  });
  otherStr = otherStr.replace(/^,\s*/, '').replace(/,\s*$/, '').trim();

  const [formData, setFormData] = useState({
    patient_number:           patient.patient_number || '',
    first_name:               patient.first_name || '',
    last_name:                patient.last_name || '',
    date_of_birth:            patient.date_of_birth ? patient.date_of_birth.split('T')[0] : '',
    gender:                   patient.gender || '',
    enrollment_date:          patient.enrollment_date ? patient.enrollment_date.split('T')[0] : '',
    phone_number:             patient.phone_number || patient.phone || '',
    alternative_phone:        patient.alternative_phone || '',
    email:                    patient.email || '',
    district:                 patient.district || '',
    ward:                     patient.ward || '',
    village:                  patient.village || '',
    headman:                  patient.headman || '',
    distance_from_clinic:     patient.distance_from_clinic || '',
    arv_regimen:              patient.arv_regimen || patient.regimen || '',
    emergency_contact_name:   patient.emergency_contact_name || '',
    emergency_contact_phone:  patient.emergency_contact_phone || '',
    // Chronic conditions
    has_hypertension:         chronicsStr.includes('hypertension'),
    has_diabetes:             chronicsStr.includes('diabetes'),
    has_tuberculosis:         chronicsStr.includes('tuberculosis'),
    has_mental_health:        chronicsStr.includes('mental health'),
    has_kidney_disease:       chronicsStr.includes('kidney'),
    other_chronic_condition:  otherStr || '',
    // ── NEW ML FIELDS ─────────────────────────────────────────────
    marital_status:           patient.marital_status || '',
    treatment_supporter:      patient.treatment_supporter === true || patient.treatment_supporter === 'true',
    who_clinical_stage:       String(patient.who_clinical_stage || '2'),
    art_start_date:           patient.art_start_date ? patient.art_start_date.split('T')[0] : '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [success, setSuccess] = useState(false);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;

    if (type === 'checkbox') {
      setFormData(prev => ({ ...prev, [name]: checked }));
      return;
    }

    const lettersOnly     = /^[a-zA-Z\s\-'.]*$/;
    const wholeNumberOnly = /^\d*$/;
    const phoneChars      = /^[\+\d\s\-\(\)]*$/;

    const letterFields   = ['first_name', 'last_name', 'district', 'village', 'headman', 'emergency_contact_name'];
    const wholeNumFields = ['ward', 'distance_from_clinic'];
    const phoneFields    = ['phone_number', 'alternative_phone', 'emergency_contact_phone'];

    if (letterFields.includes(name)   && !lettersOnly.test(value))     return;
    if (wholeNumFields.includes(name) && !wholeNumberOnly.test(value)) return;
    if (phoneFields.includes(name)    && !phoneChars.test(value))      return;

    if (name === 'date_of_birth' && value) {
      const year = new Date(value).getFullYear();
      if (year < 1946 || year > 2018) return;
    }

    setFormData({ ...formData, [name]: value });
  };

  const handleDobBlur = (e) => {
    const value = e.target.value;
    if (!value) return;
    const year = parseInt(value.split('-')[0], 10);
    if (year < 1946 || year > 2018) {
      setFormData(prev => ({ ...prev, date_of_birth: '' }));
      setError('Date of birth must be between 1946 and 2018');
    }
  };

  const validateForm = () => {
    const fail = (msg) => { setError(msg); return msg; };
    const lettersOnly     = /^[a-zA-Z\s\-'.]+$/;
    const wholeNumberOnly = /^\d+$/;
    const phoneRegex      = /^[\+]?[0-9\s\-\(\)]+$/;

    if (!formData.first_name || !formData.last_name) return fail('First name and last name are required');
    if (!lettersOnly.test(formData.first_name))      return fail('First name must contain letters only');
    if (!lettersOnly.test(formData.last_name))       return fail('Last name must contain letters only');
    if (!formData.date_of_birth)                     return fail('Date of birth is required');
    if (!formData.gender)                            return fail('Gender is required');
    if (!formData.phone_number)                      return fail('Phone number is required');
    if (!phoneRegex.test(formData.phone_number))     return fail('Phone number must contain numbers only');

    if (formData.alternative_phone && !phoneRegex.test(formData.alternative_phone))
      return fail('Alternative phone must contain numbers only');
    if (formData.ward && !wholeNumberOnly.test(formData.ward))
      return fail('Ward must be a whole number (e.g. 14)');
    if (formData.distance_from_clinic && !wholeNumberOnly.test(String(formData.distance_from_clinic)))
      return fail('Distance from clinic must be a whole number');
    if (formData.district && !lettersOnly.test(formData.district))
      return fail('District must contain letters only');
    if (formData.village && !lettersOnly.test(formData.village))
      return fail('Village must contain letters only');
    if (formData.headman && !lettersOnly.test(formData.headman))
      return fail('Headman name must contain letters only');
    if (formData.emergency_contact_name && !lettersOnly.test(formData.emergency_contact_name))
      return fail('Emergency contact name must contain letters only');
    if (formData.emergency_contact_phone && !phoneRegex.test(formData.emergency_contact_phone))
      return fail('Emergency contact phone must contain numbers only');

    const dob   = new Date(formData.date_of_birth);
    const today = new Date();
    if (dob >= today)                   return fail('Date of birth must be in the past');
    if (dob < new Date('1946-01-01'))   return fail('Date of birth cannot be before 1946');

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
      if (formData.has_hypertension)        conditions.push('Hypertension');
      if (formData.has_diabetes)            conditions.push('Diabetes');
      if (formData.has_tuberculosis)        conditions.push('Tuberculosis');
      if (formData.has_mental_health)       conditions.push('Mental Health Condition');
      if (formData.has_kidney_disease)      conditions.push('Kidney Disease');
      if (formData.other_chronic_condition) conditions.push(formData.other_chronic_condition.trim());

      const payload = {
        ...formData,
        chronic_diseases:   conditions.join(', '),
        marital_status:     formData.marital_status,
        treatment_supporter:formData.treatment_supporter,
        who_clinical_stage: parseInt(formData.who_clinical_stage) || 2,
        art_start_date:     formData.art_start_date || null,
      };

      const patientId = patient.patient_id || patient.id;
      const response  = await patientsAPI.updatePatient(patientId, payload);

      setSuccess(true);
      const patientName = `${formData.first_name} ${formData.last_name}`;

      showToast({ type: 'success', message: `${patientName}'s information has been updated`, duration: 5000 });
      addNotification({
        type: 'patient', title: 'Patient Information Updated',
        message: `${patientName} (${formData.patient_number}) profile updated`,
        showToast: false
      });

      setTimeout(() => {
        if (onSuccess) onSuccess(response);
        if (onClose)   onClose();
      }, 2000);

    } catch (err) {
      const errorMessage = err.response?.data?.message || err.response?.data?.error || 'Failed to update patient.';
      setError(errorMessage);
      setLoading(false);
      showToast({ type: 'error', message: errorMessage, duration: 5000 });
    }
  };

  if (success) {
    return (
      <div className="form-overlay">
        <div className="form-modal success-modal">
          <div className="success-icon">✅</div>
          <h2>Patient Updated Successfully!</h2>
          <p>{formData.first_name} {formData.last_name}'s information has been updated.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="form-overlay" onClick={onClose}>
      <div className="form-modal" onClick={e => e.stopPropagation()}>
        <div className="form-header">
          <h2>Edit Patient Information</h2>
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
                <label>Patient Number</label>
                <input type="text" name="patient_number" value={formData.patient_number}
                  readOnly style={{ backgroundColor: '#f3f4f6' }} />
                <small style={{ color: '#6b7280', fontSize: '0.75rem' }}>Patient number cannot be changed</small>
              </div>
              <div className="form-group">
                <label>Enrollment Date</label>
                <input type="date" name="enrollment_date" value={formData.enrollment_date}
                  readOnly style={{ backgroundColor: '#f3f4f6' }} />
                <small style={{ color: '#6b7280', fontSize: '0.75rem' }}>Enrollment date cannot be changed</small>
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
                  min="1946-01-01" max="2018-12-31" required />
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
              </div>
              <div className="form-group">
                <label>ART Start Date</label>
                <input type="date" name="art_start_date" value={formData.art_start_date}
                  onChange={handleChange} />
                <small style={{ color: '#6b7280', fontSize: '0.75rem' }}>
                  Date patient started ART
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
                <label>Alternative Phone</label>
                <input type="tel" name="alternative_phone" value={formData.alternative_phone}
                  onChange={handleChange} placeholder="+263 71 234 5678" />
              </div>
            </div>

            <div className="form-group">
              <label>Email</label>
              <input type="email" name="email" value={formData.email}
                onChange={handleChange} placeholder="example@email.com" />
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
                onChange={handleChange} placeholder="e.g. 5" min="0" step="1" />
            </div>
          </div>

          {/* ── Medical Information ── */}
          <div className="form-section">
            <h3 className="section-title">Medical Information</h3>

            <div className="form-row">
              <div className="form-group">
                <label>ARV Regimen</label>
                <select name="arv_regimen" value={formData.arv_regimen} onChange={handleChange}>
                  <option value="">Select ARV regimen</option>
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
                A treatment supporter reminds the patient to collect medication and accompanies them to clinic.
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
          </div>

          {/* ── Emergency Contact ── */}
          <div className="form-section">
            <h3 className="section-title">Emergency Contact</h3>
            <div className="form-row">
              <div className="form-group">
                <label>Emergency Contact Name</label>
                <input type="text" name="emergency_contact_name"
                  value={formData.emergency_contact_name}
                  onChange={handleChange} placeholder="Contact person name" />
              </div>
              <div className="form-group">
                <label>Emergency Contact Phone</label>
                <input type="tel" name="emergency_contact_phone"
                  value={formData.emergency_contact_phone}
                  onChange={handleChange} placeholder="+263 77 123 4567" />
              </div>
            </div>
          </div>

          {/* ── Actions ── */}
          <div className="form-actions">
            <button type="button" className="cancel-button" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="submit-button" disabled={loading}>
              {loading
                ? (<><span className="spinner-small"></span>Updating...</>)
                : '💾 Save Changes'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}

export default PatientEditForm;