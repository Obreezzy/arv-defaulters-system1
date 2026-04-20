import React, { useState } from 'react';
import './PatientForm.css'; // Reuse the same CSS
import { patientsAPI } from '../services/api';
import { useNotifications } from '../contexts/NotificationContext';

function PatientEditForm({ patient, onClose, onSuccess }) {
  const { showToast, addNotification } = useNotifications();
  
  // Pre-fill form with existing patient data
  const [formData, setFormData] = useState({
    patient_number: patient.patient_number || '',
    first_name: patient.first_name || '',
    last_name: patient.last_name || '',
    date_of_birth: patient.date_of_birth ? patient.date_of_birth.split('T')[0] : '',
    gender: patient.gender || '',
    enrollment_date: patient.enrollment_date ? patient.enrollment_date.split('T')[0] : '',
    phone_number: patient.phone_number || patient.phone || '',
    alternative_phone: patient.alternative_phone || '',
    email: patient.email || '',
    // UPDATED: Pre-fill rural location fields
    district: patient.district || '',
    ward: patient.ward || '',
    village: patient.village || '',
    headman: patient.headman || '',
    distance_from_clinic: patient.distance_from_clinic || '',
    arv_regimen: patient.arv_regimen || patient.regimen || '',
    emergency_contact_name: patient.emergency_contact_name || '',
    emergency_contact_phone: patient.emergency_contact_phone || ''
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value
    });
  };

  const validateForm = () => {
    const fail = (msg) => { setError(msg); return msg; };

    if (!formData.first_name || !formData.last_name) return fail('First name and last name are required');
    if (!formData.date_of_birth)                     return fail('Date of birth is required');
    if (!formData.gender)                            return fail('Gender is required');
    if (!formData.phone_number)                      return fail('Phone number is required');

    const phoneRegex = /^[\+]?[0-9\s\-\(\)]+$/;
    if (!phoneRegex.test(formData.phone_number))     return fail('Please enter a valid phone number');

    const dob = new Date(formData.date_of_birth);
    const today = new Date();
    if (dob >= today) return fail('Date of birth must be in the past');

    setError(null);
    return null; // null = no error
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const validationError = validateForm();
    if (validationError) {
      showToast({
        type: 'error',
        message: validationError,
        duration: 4000
      });
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log('📤 Updating patient data:', formData);
      console.log('Patient ID:', patient.patient_id || patient.id);

      const patientId = patient.patient_id || patient.id;
      const response = await patientsAPI.updatePatient(patientId, formData);

      console.log('✅ Patient updated successfully:', response);

      setSuccess(true);

      const patientName = `${formData.first_name} ${formData.last_name}`;
      
      showToast({
        type: 'success',
        title: 'Patient Updated',
        message: `${patientName}'s information has been updated`,
        duration: 5000
      });

      addNotification({
        type: 'patient',
        title: 'Patient Information Updated',
        message: `${patientName} (${formData.patient_number}) profile updated`,
        showToast: false
      });

      setTimeout(() => {
        if (onSuccess) {
          onSuccess(response);
        }
        if (onClose) {
          onClose();
        }
      }, 2000);

    } catch (err) {
      console.error('❌ Error updating patient:', err);
      console.error('Error response:', err.response?.data);
      
      const errorMessage = err.response?.data?.message || 
                          err.response?.data?.error || 
                          'Failed to update patient. Please try again.';
      
      setError(errorMessage);
      setLoading(false);

      showToast({
        type: 'error',
        title: 'Update Failed',
        message: errorMessage,
        duration: 5000
      });
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
      <div className="form-modal" onClick={(e) => e.stopPropagation()}>
        <div className="form-header">
          <h2>Edit Patient Information</h2>
          <button className="close-button" onClick={onClose}>✕</button>
        </div>

        {error && (
          <div className="form-error">
            <span>⚠️</span>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="patient-form">
          {/* Patient Identification */}
          <div className="form-section">
            <h3 className="section-title">Patient Identification</h3>
            
            <div className="form-row">
              <div className="form-group">
                <label>Patient Number</label>
                <input
                  type="text"
                  name="patient_number"
                  value={formData.patient_number}
                  readOnly
                  style={{ backgroundColor: '#f3f4f6' }}
                />
                <small style={{ color: '#6b7280', fontSize: '0.75rem' }}>
                  Patient number cannot be changed
                </small>
              </div>

              <div className="form-group">
                <label>Enrollment Date</label>
                <input
                  type="date"
                  name="enrollment_date"
                  value={formData.enrollment_date}
                  readOnly
                  style={{ backgroundColor: '#f3f4f6' }}
                />
                <small style={{ color: '#6b7280', fontSize: '0.75rem' }}>
                  Enrollment date cannot be changed
                </small>
              </div>
            </div>
          </div>

          {/* Personal Information */}
          <div className="form-section">
            <h3 className="section-title">Personal Information</h3>
            
            <div className="form-row">
              <div className="form-group">
                <label>First Name <span className="required">*</span></label>
                <input
                  type="text"
                  name="first_name"
                  value={formData.first_name}
                  onChange={handleChange}
                  placeholder="Enter first name"
                  required
                />
              </div>

              <div className="form-group">
                <label>Last Name <span className="required">*</span></label>
                <input
                  type="text"
                  name="last_name"
                  value={formData.last_name}
                  onChange={handleChange}
                  placeholder="Enter last name"
                  required
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Date of Birth <span className="required">*</span></label>
                <input
                  type="date"
                  name="date_of_birth"
                  value={formData.date_of_birth}
                  onChange={handleChange}
                  max={new Date().toISOString().split('T')[0]}
                  required
                />
              </div>

              <div className="form-group">
                <label>Gender <span className="required">*</span></label>
                <select
                  name="gender"
                  value={formData.gender}
                  onChange={handleChange}
                  required
                >
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
                <input
                  type="tel"
                  name="phone_number"
                  value={formData.phone_number}
                  onChange={handleChange}
                  placeholder="+263 77 123 4567"
                  required
                />
              </div>

              <div className="form-group">
                <label>Alternative Phone</label>
                <input
                  type="tel"
                  name="alternative_phone"
                  value={formData.alternative_phone}
                  onChange={handleChange}
                  placeholder="+263 71 234 5678"
                />
              </div>
            </div>

            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="example@email.com"
              />
            </div>
          </div>

          {/* Rural Location Information */}
          <div className="form-section">
            <h3 className="section-title">Rural Location Information</h3>
            
            <div className="form-row">
              <div className="form-group">
                <label>District</label>
                <input
                  type="text"
                  name="district"
                  value={formData.district}
                  onChange={handleChange}
                  placeholder="e.g. Mutasa"
                />
              </div>

              <div className="form-group">
                <label>Ward</label>
                <input
                  type="text"
                  name="ward"
                  value={formData.ward}
                  onChange={handleChange}
                  placeholder="e.g. Ward 14"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Village</label>
                <input
                  type="text"
                  name="village"
                  value={formData.village}
                  onChange={handleChange}
                  placeholder="e.g. Chigodora"
                />
              </div>

              <div className="form-group">
                <label>Headman / Sabhuku</label>
                <input
                  type="text"
                  name="headman"
                  value={formData.headman}
                  onChange={handleChange}
                  placeholder="e.g. Sabhuku Muchabaiwa"
                />
              </div>
            </div>

            <div className="form-group">
                <label>Distance from Clinic (km)</label>
                <input
                  type="number"
                  name="distance_from_clinic"
                  value={formData.distance_from_clinic}
                  onChange={handleChange}
                  placeholder="e.g., 5"
                  min="0"
                  step="0.1"
                />
              </div>
          </div>

          {/* Medical Information */}
          <div className="form-section">
            <h3 className="section-title">Medical Information</h3>
            
            <div className="form-group">
              <label>ARV Regimen</label>
              <select
                name="arv_regimen"
                value={formData.arv_regimen}
                onChange={handleChange}
              >
                <option value="">Select ARV regimen</option>
                <option value="TDF/3TC/EFV">TDF/3TC/EFV (Tenofovir/Lamivudine/Efavirenz)</option>
                <option value="TDF/3TC/DTG">TDF/3TC/DTG (Tenofovir/Lamivudine/Dolutegravir)</option>
                <option value="ABC/3TC/DTG">ABC/3TC/DTG (Abacavir/Lamivudine/Dolutegravir)</option>
                <option value="AZT/3TC/NVP">AZT/3TC/NVP (Zidovudine/Lamivudine/Nevirapine)</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          {/* Emergency Contact */}
          <div className="form-section">
            <h3 className="section-title">Emergency Contact</h3>
            
            <div className="form-row">
              <div className="form-group">
                <label>Emergency Contact Name</label>
                <input
                  type="text"
                  name="emergency_contact_name"
                  value={formData.emergency_contact_name}
                  onChange={handleChange}
                  placeholder="Contact person name"
                />
              </div>

              <div className="form-group">
                <label>Emergency Contact Phone</label>
                <input
                  type="tel"
                  name="emergency_contact_phone"
                  value={formData.emergency_contact_phone}
                  onChange={handleChange}
                  placeholder="+263 77 123 4567"
                />
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <div className="form-actions">
            <button
              type="button"
              className="cancel-button"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="submit-button"
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="spinner-small"></span>
                  Updating...
                </>
              ) : (
                '💾 Save Changes'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default PatientEditForm;