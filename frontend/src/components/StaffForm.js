import React, { useState } from 'react';
import { authAPI } from '../services/api';
import { useNotifications } from '../contexts/NotificationContext';

function StaffForm({ onClose, onSuccess }) {
  const { showToast } = useNotifications();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    full_name:    '',
    username:     '',
    email:        '',
    phone_number: '',
    role:         'healthcare_worker',
    password:     ''
  });

  const isNurseRole = formData.role === 'healthcare_worker';

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
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
            <div className="form-group">
              <label>Full Name</label>
              <input type="text" name="full_name" required value={formData.full_name} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label>Username</label>
              <input type="text" name="username" required value={formData.username} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label>Email Address</label>
              <input type="email" name="email" required value={formData.email} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label>Phone Number</label>
              <input type="text" name="phone_number" value={formData.phone_number} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label>System Role</label>
              <select name="role" required value={formData.role} onChange={handleChange}>
                <option value="healthcare_worker">Healthcare Worker (Nurse)</option>
                <option value="data_entry">Data Entry</option>
                <option value="admin">Administrator</option>
              </select>
            </div>
            <div className="form-group">
              <label>Temporary Password</label>
              <input type="password" name="password" required value={formData.password} onChange={handleChange} minLength="6" />
            </div>
          </div>

          {/* ── Auto-generation notice ── */}
          <div style={{
            marginTop: '1rem',
            padding: '0.75rem 1rem',
            borderRadius: '8px',
            backgroundColor: isNurseRole ? '#f0fdf4' : '#f8fafc',
            border: `1px solid ${isNurseRole ? '#bbf7d0' : '#e2e8f0'}`,
            fontSize: '0.85rem',
            color: isNurseRole ? '#166534' : '#64748b'
          }}>
            {isNurseRole ? (
              <>
                <strong>🪪 Staff ID</strong> and <strong>💉 Nurse Number</strong> will be automatically generated
                and linked to this account. The nurse number will auto-fill when they record pickups or register patients.
              </>
            ) : (
              <>
                <strong>🪪 Staff ID</strong> will be automatically generated for this account.
                {formData.role === 'admin' ? ' Admins do not have a nurse number.' : ' Data entry staff do not have a nurse number.'}
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