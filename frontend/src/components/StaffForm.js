import React, { useState } from 'react';
import { authAPI } from '../services/api';
import { useNotifications } from '../contexts/NotificationContext';

function StaffForm({ onClose, onSuccess }) {
  const { showToast } = useNotifications();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    full_name:     '',
    username:      '',
    email:         '',
    phone_number:  '',
    role:          'healthcare_worker',
    password:      '',
    clinic_name:   '',
    clinic_number: ''
  });

  const isNurseRole  = formData.role === 'healthcare_worker';
  const isAdminRole  = formData.role === 'admin';
  const needsClinic  = !isAdminRole;

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (needsClinic && !formData.clinic_number.trim()) {
      showToast({ type: 'error', message: 'Clinic number is required.' });
      return;
    }
    if (needsClinic && !formData.clinic_name.trim()) {
      showToast({ type: 'error', message: 'Clinic name is required.' });
      return;
    }

    setLoading(true);
    try {
      await authAPI.register(formData);
      showToast({ type: 'success', message: 'Staff member added successfully!' });
      onSuccess();
      onClose();
    } catch (err) {
      console.error(err);
      showToast({ type: 'error', message: err.response?.data?.message || 'Failed to create account.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content staff-modal">
        <div className="modal-header">
          <h3 className="modal-title">Add New Staff Member</h3>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-grid">

            {/* ── Personal Info ── */}
            <div className="form-group">
              <label>Full Name <span style={{ color: '#ef4444' }}>*</span></label>
              <input type="text" name="full_name" required
                value={formData.full_name} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label>Username <span style={{ color: '#ef4444' }}>*</span></label>
              <input type="text" name="username" required
                value={formData.username} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label>Email Address <span style={{ color: '#ef4444' }}>*</span></label>
              <input type="email" name="email" required
                value={formData.email} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label>Phone Number</label>
              <input type="text" name="phone_number"
                value={formData.phone_number} onChange={handleChange} />
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
                value={formData.password} onChange={handleChange} />
            </div>
          </div>

          {/* ── Clinic Details (not for admin) ── */}
          {needsClinic && (
            <div style={{ marginTop: '1.25rem' }}>
              <div style={{
                fontSize: '0.8rem', fontWeight: '700', color: '#6b7280',
                textTransform: 'uppercase', letterSpacing: '0.05em',
                marginBottom: '0.75rem'
              }}>
                🏥 Clinic Assignment
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label>
                    Clinic Number <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    name="clinic_number"
                    value={formData.clinic_number}
                    onChange={handleChange}
                    placeholder="e.g. CLN-001"
                    required={needsClinic}
                  />
                  <small style={{ color: '#6b7280', fontSize: '0.75rem' }}>
                    This will auto-fill when they record pickups
                  </small>
                </div>
                <div className="form-group">
                  <label>
                    Clinic Name <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    name="clinic_name"
                    value={formData.clinic_name}
                    onChange={handleChange}
                    placeholder="e.g. Sakubva Clinic, Mutare"
                    required={needsClinic}
                  />
                  <small style={{ color: '#6b7280', fontSize: '0.75rem' }}>
                    Full name of the clinic they work at
                  </small>
                </div>
              </div>
            </div>
          )}

          {/* ── Auto-generation notice ── */}
          <div style={{
            marginTop: '1rem',
            padding: '0.75rem 1rem',
            borderRadius: '8px',
            backgroundColor: isNurseRole ? '#f0fdf4' : '#f8fafc',
            border: `1px solid ${isNurseRole ? '#bbf7d0' : '#e2e8f0'}`,
            fontSize: '0.82rem',
            color: isNurseRole ? '#166534' : '#64748b',
            lineHeight: '1.5'
          }}>
            {isNurseRole && (
              <>
                ✅ A <strong>Staff ID</strong> (STF-XXX) and <strong>Nurse Number</strong> (NRS-XXX)
                will be auto-generated for this account.<br />
                When they log in, their <strong>Clinic Number</strong>, <strong>Clinic Name</strong>,
                and <strong>Nurse Number</strong> will all auto-fill and lock when recording pickups
                or registering patients.
              </>
            )}
            {formData.role === 'data_entry' && (
              <>
                ✅ A <strong>Staff ID</strong> (STF-XXX) will be auto-generated.<br />
                Their <strong>Clinic Number</strong> and <strong>Clinic Name</strong> will
                auto-fill when using the system. No nurse number is assigned.
              </>
            )}
            {isAdminRole && (
              <>
                ✅ A <strong>Staff ID</strong> (STF-XXX) will be auto-generated for this
                administrator account. Admins are not assigned to a specific clinic.
              </>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
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