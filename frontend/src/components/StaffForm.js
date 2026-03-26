import React, { useState } from 'react';
import { authAPI } from '../services/api';
import { useNotifications } from '../contexts/NotificationContext';

function StaffForm({ onClose, onSuccess }) {
  const { showToast } = useNotifications();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    full_name: '',
    username: '',
    email: '',
    phone_number: '',
    role: 'healthcare_worker',
    password: ''
  });

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
                <option value="healthcare_worker">Healthcare Worker</option>
                <option value="data_entry">Data Entry</option>
                <option value="admin">Administrator</option>
              </select>
            </div>
            <div className="form-group">
              <label>Temporary Password</label>
              <input type="password" name="password" required value={formData.password} onChange={handleChange} minLength="6" />
            </div>
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