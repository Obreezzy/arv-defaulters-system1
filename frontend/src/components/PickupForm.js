import React, { useState, useEffect } from 'react';
import { X, Pill, Building2, Calendar, Activity } from 'lucide-react';
import './PickupForm.css';
import { pickupsAPI, patientsAPI } from '../services/api';
import { useNotifications } from '../contexts/NotificationContext';

function PickupForm({ isOpen, onClose, onSuccess, preselectedPatient = null, currentUser = null }) {
  const { showToast, addNotification } = useNotifications();

  const [step, setStep]                   = useState('search');
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [patients, setPatients]           = useState([]);
  const [searchQuery, setSearchQuery]     = useState('');
  const [loading, setLoading]             = useState(false);

  const isNurse = currentUser?.role === 'healthcare_worker';

  const getInitialFormData = () => ({
    // Pickup schedule
    visit_date:               new Date().toISOString().split('T')[0],
    scheduled_next_appt_date: '',
    // Medication
    days_dispensed:           '90',
    regimen:                  '',
    dsd_model:                '',
    // Clinical measurements
    weight_kg:                '',
    viral_load_result:        '',
    viral_load_date:          '',       // ← ADDED
    tb_screen_result:         '',
    // Nurse/clinic (auto-filled for nurses)
    clinic_number:  isNurse ? (currentUser?.clinic_number || '') : '',
    nurse_number:   isNurse ? (currentUser?.nurse_number  || '') : '',
    dispensing_clinic: isNurse ? (currentUser?.clinic_name || '') : '',
    notes: ''
  });

  const [formData, setFormData] = useState(getInitialFormData);

  // Re-sync nurse fields if currentUser loads after mount
  useEffect(() => {
    if (isNurse) {
      setFormData(prev => ({
        ...prev,
        clinic_number:     currentUser?.clinic_number || '',
        nurse_number:      currentUser?.nurse_number  || '',
        dispensing_clinic: currentUser?.clinic_name   || ''
      }));
    }
  }, [currentUser, isNurse]);

  useEffect(() => {
    if (isOpen) {
      loadPatients();
      if (preselectedPatient) {
        selectPatient(preselectedPatient);
      } else {
        resetForm();
      }
    }
  }, [isOpen, preselectedPatient]);

  const resetForm = () => {
    setStep('search');
    setSelectedPatient(null);
    setSearchQuery('');
    setFormData(getInitialFormData());
  };

  const loadPatients = async () => {
    try {
      const res = await patientsAPI.getAllPatients();
      const list = (res.data || res.patients || []).filter(p => p.exit_status === 'active' || p.is_active !== false);
      setPatients(list);
    } catch (err) {
      console.error('Error loading patients', err);
    }
  };

  // Search by patient_id, name, district or village
  const filteredPatients = patients.filter(p => {
    const term = searchQuery.toLowerCase().trim();
    if (!term) return true;
    return (
      (p.patient_id             || '').toLowerCase().includes(term) ||
      (p.first_name             || '').toLowerCase().includes(term) ||
      (p.last_name              || '').toLowerCase().includes(term) ||
      (`${p.first_name || ''} ${p.last_name || ''}`).toLowerCase().includes(term) ||
      (p.residence_district     || '').toLowerCase().includes(term) ||
      (p.residence_village      || '').toLowerCase().includes(term)
    );
  });

  const selectPatient = (patient) => {
    setSelectedPatient(patient);
    setStep('details');
    // Auto-calculate next appointment based on days_dispensed
    const days = parseInt(formData.days_dispensed || 90);
    const next = new Date();
    next.setDate(next.getDate() + days);
    setFormData(prev => ({
      ...prev,
      scheduled_next_appt_date: next.toISOString().split('T')[0]
    }));
  };

  // Recalculate next appt when days_dispensed changes
  const handleDaysChange = (e) => {
    const days = parseInt(e.target.value || 90);
    const next = new Date(formData.visit_date || new Date());
    next.setDate(next.getDate() + days);
    setFormData(prev => ({
      ...prev,
      days_dispensed: e.target.value,
      scheduled_next_appt_date: next.toISOString().split('T')[0]
    }));
  };

  const handleChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedPatient) return;

    if (!formData.clinic_number.trim()) {
      showToast({ type: 'error', message: 'Clinic number is required' });
      return;
    }
    if (!formData.nurse_number.trim()) {
      showToast({ type: 'error', message: 'Nurse number is required' });
      return;
    }
    if (!formData.days_dispensed) {
      showToast({ type: 'error', message: 'Days dispensed is required' });
      return;
    }

    setLoading(true);
    try {
      await pickupsAPI.recordPickup({
        patient_id:               selectedPatient.patient_id,
        visit_date:               formData.visit_date,
        scheduled_next_appt_date: formData.scheduled_next_appt_date,
        days_dispensed:           parseInt(formData.days_dispensed),
        regimen:                  formData.regimen         || null,
        dsd_model:                formData.dsd_model       || null,
        weight_kg:                formData.weight_kg       ? parseFloat(formData.weight_kg) : null,
        viral_load_result:        formData.viral_load_result ? parseFloat(formData.viral_load_result) : null,
        viral_load_date:          formData.viral_load_date || null,
        tb_screen_result:         formData.tb_screen_result || null,
        clinic_number:            formData.clinic_number,
        nurse_number:             formData.nurse_number,
        dispensing_clinic:        formData.dispensing_clinic || null,
        notes:                    formData.notes            || null
      });

      showToast({ type: 'success', message: 'Pickup recorded successfully!' });
      addNotification?.({
        type: 'pickup',
        title: 'Medication Pickup',
        message: `${selectedPatient.patient_id} collected meds. Next: ${formData.scheduled_next_appt_date}`
      });

      onSuccess?.();
      onClose();
    } catch (err) {
      console.error(err);
      const msg = err.response?.data?.message || 'Failed to record pickup.';
      showToast({ type: 'error', message: msg });
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const lockedStyle = {
    backgroundColor: '#f0fdf4',
    color: '#166534',
    fontWeight: '600',
    border: '2px solid #bbf7d0',
    cursor: 'not-allowed'
  };

  return (
    <div className="form-overlay" onClick={onClose}>
      <div className="form-modal pickup-modal" onClick={e => e.stopPropagation()}>

        <div className="form-header">
          <h2><Pill size={20} /> Record Pickup</h2>
          <button className="close-button" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="modal-body" style={{ padding: '1.5rem' }}>

          {/* ── STEP 1: Search Patient ── */}
          {step === 'search' && (
            <div className="search-section">
              <input
                type="text"
                placeholder="Search by Patient ID, District, or Village..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="search-input"
                autoFocus
              />
              <div className="search-results-list">
                {searchQuery && filteredPatients.length === 0 && (
                  <p className="search-empty-state">No patients found.</p>
                )}
                {filteredPatients.slice(0, 8).map(p => (
                  <div key={p.patient_id} className="patient-search-item" onClick={() => selectPatient(p)}>
                    <div className="p-avatar">
                      {p.sex === 'F' ? '♀' : p.sex === 'M' ? '♂' : '?'}
                    </div>
                    <div className="p-details">
                      <strong>{p.patient_id}</strong>
                      <span>
                        {p.sex} · {p.residence_district || '—'}
                        {p.risk_tier ? ` · ${p.risk_tier.toUpperCase()} risk` : ''}
                      </span>
                    </div>
                    <button className="btn-select">Select</button>
                  </div>
                ))}
                {!searchQuery && (
                  <div className="search-empty-state">
                    <p>Start typing to find a patient...</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── STEP 2: Pickup Details ── */}
          {step === 'details' && selectedPatient && (
            <form onSubmit={handleSubmit}>

              {/* Patient Summary */}
              <div className="selected-patient-summary">
                <div className="p-info">
                  <strong>{selectedPatient.patient_id}</strong>
                  <small>
                    {selectedPatient.sex} · {selectedPatient.residence_district || '—'}
                    {selectedPatient.risk_tier
                      ? ` · ${selectedPatient.risk_tier.toUpperCase()} risk (${Math.round((selectedPatient.default_probability || 0) * 100)}%)`
                      : ''}
                  </small>
                </div>
                {!preselectedPatient && (
                  <button type="button" className="btn-change-patient" onClick={() => setStep('search')}>
                    Change
                  </button>
                )}
              </div>

              {/* Nurse banner */}
              {isNurse && (
                <div style={{
                  background: '#f0fdf4', border: '1px solid #bbf7d0',
                  borderRadius: '8px', padding: '0.6rem 1rem',
                  marginBottom: '1rem', fontSize: '0.82rem', color: '#166534'
                }}>
                  Logged in as <strong>{currentUser.full_name}</strong> —
                  clinic and nurse number auto-filled.
                </div>
              )}

              {/* ── Dispensing Details ── */}
              <div className="pickup-section-title"><Building2 size={15} /> Dispensing Details</div>
              <div className="form-row">
                <div className="form-group">
                  <label>Clinic Number <span style={{ color: '#ef4444' }}>*</span></label>
                  {isNurse ? (
                    <>
                      <input type="text" value={formData.clinic_number} readOnly style={lockedStyle} />
                      <small style={{ color: '#166534' }}>Auto-filled from your account</small>
                    </>
                  ) : (
                    <input type="text" name="clinic_number" value={formData.clinic_number}
                      onChange={handleChange} placeholder="e.g. FAC0001" required />
                  )}
                </div>
                <div className="form-group">
                  <label>Nurse Number <span style={{ color: '#ef4444' }}>*</span></label>
                  {isNurse ? (
                    <>
                      <input type="text" value={formData.nurse_number} readOnly style={lockedStyle} />
                      <small style={{ color: '#166534' }}>Auto-filled from your account</small>
                    </>
                  ) : (
                    <input type="text" name="nurse_number" value={formData.nurse_number}
                      onChange={handleChange} placeholder="e.g. NRS-045" required />
                  )}
                </div>
              </div>

              {/* ── Medication ── */}
              <div className="pickup-section-title" style={{ marginTop: '1rem' }}>
                <Pill size={15} /> Medication
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Days Dispensed <span style={{ color: '#ef4444' }}>*</span></label>
                  <select name="days_dispensed" value={formData.days_dispensed} onChange={handleDaysChange} required>
                    <option value="30">30 days</option>
                    <option value="60">60 days</option>
                    <option value="90">90 days (MMD)</option>
                    <option value="180">180 days</option>
                  </select>
                  <small>Affects next appointment date automatically</small>
                </div>
                <div className="form-group">
                  <label>DSD Model</label>
                  <select name="dsd_model" value={formData.dsd_model} onChange={handleChange}>
                    <option value="">Select...</option>
                    <option value="facility">Facility</option>
                    <option value="CARG">CARG</option>
                    <option value="FBIM">FBIM</option>
                    <option value="FAMA">FAMA</option>
                    <option value="community_ART">Community ART</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Regimen</label>
                <select name="regimen" value={formData.regimen} onChange={handleChange}>
                  <option value="">Select...</option>
                  <option value="TDF/3TC/DTG (TLD)">TDF/3TC/DTG (TLD)</option>
                  <option value="TDF/3TC/EFV">TDF/3TC/EFV</option>
                  <option value="AZT/3TC/NVP">AZT/3TC/NVP</option>
                  <option value="AZT/3TC/EFV">AZT/3TC/EFV</option>
                  <option value="TDF/3TC/NVP">TDF/3TC/NVP</option>
                  <option value="ABC/3TC/DTG">ABC/3TC/DTG</option>
                  <option value="LPV/r based">LPV/r based</option>
                  <option value="other">Other</option>
                </select>
              </div>

              {/* ── Pickup Schedule ── */}
              <div className="pickup-section-title" style={{ marginTop: '1rem' }}>
                <Calendar size={15} /> Pickup Schedule
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Visit Date <span style={{ color: '#ef4444' }}>*</span></label>
                  <input type="date" name="visit_date" value={formData.visit_date}
                    onChange={handleChange} required />
                </div>
                <div className="form-group">
                  <label>Next Appointment <span style={{ color: '#ef4444' }}>*</span></label>
                  <input type="date" name="scheduled_next_appt_date"
                    value={formData.scheduled_next_appt_date}
                    onChange={handleChange} required />
                  <small>Auto-calculated from days dispensed</small>
                </div>
              </div>

              {/* ── Clinical Measurements ── */}
              <div className="pickup-section-title" style={{ marginTop: '1rem' }}>
                <Activity size={15} /> Clinical Measurements
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Weight (kg)</label>
                  <input type="number" name="weight_kg" value={formData.weight_kg}
                    onChange={handleChange} placeholder="e.g. 65.5" step="0.1" min="20" max="200" />
                </div>
                <div className="form-group">
                  <label>TB Screen Result</label>
                  <select name="tb_screen_result" value={formData.tb_screen_result} onChange={handleChange}>
                    <option value="">Select...</option>
                    <option value="no_signs">No Signs</option>
                    <option value="presumptive_tb">Presumptive TB</option>
                    <option value="on_treatment">On Treatment</option>
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Viral Load Result (copies/mL)</label>
                  <input type="number" name="viral_load_result" value={formData.viral_load_result}
                    onChange={handleChange} placeholder="e.g. 0 if undetectable" min="0" />
                  <small>Enter 0 for undetectable / suppressed</small>
                </div>
                <div className="form-group">
                  <label>Viral Load Date</label>
                  <input type="date" name="viral_load_date" value={formData.viral_load_date}
                    onChange={handleChange} />
                  <small>Date the viral load was taken</small>
                </div>
              </div>

              {/* Notes */}
              <div className="form-group" style={{ marginTop: '0.5rem' }}>
                <label>Notes (Optional)</label>
                <textarea rows="2" name="notes" value={formData.notes} onChange={handleChange}
                  placeholder="Adherence issues, side effects, observations..."
                  style={{ width: '100%', padding: '0.6rem', border: '1px solid #d1d5db', borderRadius: '6px' }}
                />
              </div>

              <div className="form-actions">
                <button type="button" className="cancel-button" onClick={onClose}>Cancel</button>
                <button type="submit" className="submit-button" disabled={loading}>
                  {loading ? 'Recording...' : '✓ Confirm Pickup'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default PickupForm;