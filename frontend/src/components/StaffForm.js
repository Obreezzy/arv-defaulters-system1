import React, { useState, useEffect } from 'react';
import { authAPI, facilitiesAPI } from '../services/api';
import { useNotifications } from '../contexts/NotificationContext';

function StaffForm({ onClose, onSuccess }) {
  const { showToast } = useNotifications();
  const [loading, setLoading]       = useState(false);
  const [formError, setFormError]   = useState('');
  const [facilities, setFacilities] = useState([]);

  const [formData, setFormData] = useState({
    full_name:     '',
    username:      '',
    email:         '',
    phone_number:  '',
    role:          'healthcare_worker',
    password:      '',
    facility_id:   '',   // ← NEW: links to facilities table
    clinic_name:   '',   // auto-filled from selected facility
    clinic_number: ''    // auto-filled from selected facility
  });

  const isNurseRole  = formData.role === 'healthcare_worker';
  const isAdminRole  = formData.role === 'admin';
  const needsClinic  = !isAdminRole;

  // Load facilities list on mount
  useEffect(() => {
    const loadFacilities = async () => {
      try {
        const res = await facilitiesAPI.getAll();
        setFacilities(res.facilities || res.data || []);
      } catch (e) {
        console.error('Failed to load facilities:', e);
      }
    };
    loadFacilities();
  }, []);

  const handleChange = (e) => {
    setFormError('');
    const { name, value } = e.target;

    // When a facility is selected, auto-fill clinic_name and clinic_number
    if (name === 'facility_id') {
      const selected = facilities.find(f => f.facility_id === value);
      setFormData(prev => ({
        ...prev,
        facility_id:   value,
        clinic_name:   selected ? selected.facility_name  : '',
        clinic_number: selected ? selected.facility_id    : ''
      }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!formData.full_name.trim())  { setFormError('Full name is required.');         return; }
    if (!formData.username.trim())   { setFormError('Username is required.');           return; }
    if (!formData.email.trim())      { setFormError('Email address is required.');      return; }
    if (!formData.password || formData.password.length < 6) {
      setFormError('Password must be at least 6 characters.');
      return;
    }
    if (needsClinic && !formData.facility_id) {
      setFormError('Please select a facility for this staff member.');
      return;
    }

    setLoading(true);
    try {
      await authAPI.register(formData);
      showToast({ type: 'success', message: formData.full_name + ' added successfully!' });
      onSuccess();
      onClose();
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to create account. Please try again.';
      setFormError(message);
      showToast({ type: 'error', message });
    } finally {
      setLoading(false);
    }
  };

  // Get selected facility details for display
  const selectedFacility = facilities.find(f => f.facility_id === formData.facility_id);

  return (
    <div className="modal-overlay">
      <div className="modal-content staff-modal">
        <div className="modal-header">
          <h3 className="modal-title">Add New Staff Member</h3>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">

          {/* Error banner */}
          {formError && (
            <div style={{
              backgroundColor: '#fef2f2', border: '1px solid #fecaca',
              borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1rem',
              display: 'flex', alignItems: 'flex-start', gap: '0.5rem',
              fontSize: '0.85rem', color: '#991b1b'
            }}>
              <span style={{ fontSize: '1rem', flexShrink: 0 }}>⚠️</span>
              <span>{formError}</span>
            </div>
          )}

          <div className="form-grid">
            <div className="form-group">
              <label>Full Name <span style={{ color: '#ef4444' }}>*</span></label>
              <input type="text" name="full_name" required
                value={formData.full_name} onChange={handleChange}
                placeholder="e.g. Tendai Moyo" />
            </div>

            <div className="form-group">
              <label>Username <span style={{ color: '#ef4444' }}>*</span></label>
              <input type="text" name="username" required
                value={formData.username} onChange={handleChange}
                placeholder="e.g. tendai.moyo" />
              <small style={{ color: '#6b7280', fontSize: '0.75rem' }}>
                Must be unique — used for login identification
              </small>
            </div>

            <div className="form-group">
              <label>Email Address <span style={{ color: '#ef4444' }}>*</span></label>
              <input type="email" name="email" required
                value={formData.email} onChange={handleChange}
                placeholder="e.g. tendai@clinic.com" />
              <small style={{ color: '#6b7280', fontSize: '0.75rem' }}>
                Must be unique — used to log into the system
              </small>
            </div>

            <div className="form-group">
              <label>Phone Number</label>
              <input type="text" name="phone_number"
                value={formData.phone_number} onChange={handleChange}
                placeholder="e.g. 0771234567" />
            </div>

            <div className="form-group">
              <label>System Role <span style={{ color: '#ef4444' }}>*</span></label>
              <select name="role" required value={formData.role} onChange={handleChange}>
                <option value="healthcare_worker">Healthcare Worker (Nurse)</option>
                <option value="data_entry">Data Entry</option>
                <option value="admin">Administrator</option>
              </select>
            </div>

            <div className="form-group">
              <label>Temporary Password <span style={{ color: '#ef4444' }}>*</span></label>
              <input type="password" name="password" required minLength="6"
                value={formData.password} onChange={handleChange}
                placeholder="Min. 6 characters" />
              <small style={{ color: '#6b7280', fontSize: '0.75rem' }}>
                Staff member should change this after first login
              </small>
            </div>
          </div>

          {/* Facility Assignment — not for admins */}
          {needsClinic && (
            <div style={{ marginTop: '1.25rem' }}>
              <div style={{
                fontSize: '0.8rem', fontWeight: '700', color: '#6b7280',
                textTransform: 'uppercase', letterSpacing: '0.05em',
                marginBottom: '0.75rem'
              }}>
                 Facility Assignment
              </div>

              <div className="form-group">
                <label>Assign to Facility <span style={{ color: '#ef4444' }}>*</span></label>
                <select
                  name="facility_id"
                  value={formData.facility_id}
                  onChange={handleChange}
                  required={needsClinic}
                  style={{
                    width: '100%', padding: '0.6rem', border: '1px solid #d1d5db',
                    borderRadius: '6px', outline: 'none', fontSize: '0.875rem',
                    backgroundColor: 'white'
                  }}
                >
                  <option value="">Select a facility...</option>
                  {facilities.map(f => (
                    <option key={f.facility_id} value={f.facility_id}>
                      {f.facility_name} — {f.district}, {f.province} ({f.catchment_type})
                    </option>
                  ))}
                </select>
                <small style={{ color: '#6b7280', fontSize: '0.75rem' }}>
                  Their clinic details will auto-fill from this selection
                </small>
              </div>

              {/* Show selected facility details */}
              {selectedFacility && (
                <div style={{
                  marginTop: '0.75rem', padding: '0.75rem 1rem',
                  background: '#f0fdf4', border: '1px solid #bbf7d0',
                  borderRadius: '8px', fontSize: '0.85rem', color: '#166534'
                }}>
                  <div style={{ fontWeight: '700', marginBottom: '0.25rem' }}>
                     {selectedFacility.facility_name}
                  </div>
                  <div style={{ color: '#4b5563', fontSize: '0.8rem' }}>
                    {selectedFacility.facility_type} · {selectedFacility.district}, {selectedFacility.province}
                    · <strong>{selectedFacility.catchment_type}</strong>
                    · ID: <code>{selectedFacility.facility_id}</code>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Auto-generation notice */}
          <div style={{
            marginTop: '1rem', padding: '0.75rem 1rem', borderRadius: '8px',
            backgroundColor: isNurseRole ? '#f0fdf4' : '#f8fafc',
            border: '1px solid ' + (isNurseRole ? '#bbf7d0' : '#e2e8f0'),
            fontSize: '0.82rem',
            color: isNurseRole ? '#166534' : '#64748b',
            lineHeight: '1.6'
          }}>
            {isNurseRole && (
              <>
                 A <strong>Staff ID</strong> (STF-XXX) and <strong>Nurse Number</strong> (NRS-XXX)
                will be auto-generated.<br />
                When they log in, their <strong>Facility</strong> and <strong>Nurse Number</strong> will
                auto-fill and lock when recording pickups or registering patients.
              </>
            )}
            {formData.role === 'data_entry' && (
              <>
                 A <strong>Staff ID</strong> (STF-XXX) will be auto-generated.<br />
                Their <strong>Facility</strong> will auto-fill when using the system.
              </>
            )}
            {isAdminRole && (
              <>
                 A <strong>Staff ID</strong> (STF-XXX) will be auto-generated.
                Administrators are not assigned to a specific facility.
              </>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Creating Account...' : 'Create Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default StaffForm;