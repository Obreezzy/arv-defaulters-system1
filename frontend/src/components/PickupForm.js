import React, { useState, useEffect } from 'react';
import './PickupForm.css';
import { pickupsAPI, patientsAPI } from '../services/api';
import { useNotifications } from '../contexts/NotificationContext';

function PickupForm({ isOpen, onClose, onSuccess, preselectedPatient = null }) {
  const { showToast, addNotification } = useNotifications();
  
  const [step, setStep] = useState('search');
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [patients, setPatients] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    pickup_date: new Date().toISOString().split('T')[0],
    next_pickup_date: '',
    quantity_dispensed: '',
    clinic_number: '',
    nurse_number: '',
    dispensing_clinic: '',
    notes: ''
  });

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
    setFormData({
      pickup_date: new Date().toISOString().split('T')[0],
      next_pickup_date: '',
      quantity_dispensed: '',
      clinic_number: '',
      nurse_number: '',
      dispensing_clinic: '',
      notes: ''
    });
  };

  const loadPatients = async () => {
    try {
      const res = await patientsAPI.getAllPatients();
      const activeList = (res.data || res.patients || []).filter(p => p.is_active !== false);
      setPatients(activeList);
    } catch (err) {
      console.error("Error loading patients", err);
    }
  };

  const filteredPatients = patients.filter(p => {
    const term = searchQuery.toLowerCase();
    const fullName = `${p.first_name} ${p.last_name}`.toLowerCase();
    return fullName.includes(term) || p.patient_number.toLowerCase().includes(term);
  });

  const selectPatient = (patient) => {
    setSelectedPatient(patient);
    setStep('details');
    const frequency = parseInt(patient.pickup_frequency || 30);
    const today = new Date();
    today.setDate(today.getDate() + frequency);
    setFormData(prev => ({
      ...prev,
      next_pickup_date: today.toISOString().split('T')[0]
    }));
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

    setLoading(true);
    try {
      await pickupsAPI.recordPickup({
        patient_id: selectedPatient.patient_id,
        pickup_date: formData.pickup_date,
        next_pickup_date: formData.next_pickup_date,
        quantity_dispensed: formData.quantity_dispensed || 30,
        clinic_number: formData.clinic_number,
        nurse_number: formData.nurse_number,
        dispensing_clinic: formData.dispensing_clinic,
        notes: formData.notes
      });

      const pName = `${selectedPatient.first_name} ${selectedPatient.last_name}`;
      showToast({ type: 'success', message: 'Pickup recorded successfully!' });
      addNotification({
        type: 'pickup',
        title: 'Medication Pickup',
        message: `${pName} collected meds. Next: ${formData.next_pickup_date}`
      });
      
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      console.error(err);
      showToast({ type: 'error', message: 'Failed to record pickup.' });
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="form-overlay" onClick={onClose}>
      <div className="form-modal pickup-modal" onClick={(e) => e.stopPropagation()}>
        
        <div className="form-header">
          <h2>💊 Record Pickup</h2>
          <button className="close-button" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body" style={{ padding: '1.5rem' }}>
            
          {step === 'search' && (
            <div className="search-section">
              <input 
                type="text" 
                placeholder="🔍 Type patient name or ID..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="search-input"
                autoFocus
              />
              
              <div className="search-results-list">
                {searchQuery && filteredPatients.length === 0 && (
                  <p className="no-results">No patients found.</p>
                )}
                
                {filteredPatients.slice(0, 6).map(p => (
                  <div key={p.patient_id} className="patient-search-item" onClick={() => selectPatient(p)}>
                    <div className="p-avatar">{p.first_name[0]}{p.last_name[0]}</div>
                    <div className="p-details">
                      <strong>{p.first_name} {p.last_name}</strong>
                      <span>{p.patient_number}</span>
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

          {step === 'details' && selectedPatient && (
            <form onSubmit={handleSubmit} className="pickup-details-form">
              
              {/* Patient Summary */}
              <div className="selected-patient-summary">
                <div className="p-info">
                  <strong>{selectedPatient.first_name} {selectedPatient.last_name}</strong>
                  <small>{selectedPatient.patient_number}</small>
                </div>
                {!preselectedPatient && (
                  <button type="button" className="btn-change-patient" onClick={() => setStep('search')}>
                    Change
                  </button>
                )}
              </div>

              {/* Clinic & Nurse Info */}
              <div className="pickup-section-title">🏥 Dispensing Details</div>
              <div className="form-row">
                <div className="form-group">
                  <label>Clinic Number <span style={{color:'#ef4444'}}>*</span></label>
                  <input
                    type="text"
                    value={formData.clinic_number}
                    onChange={(e) => setFormData({...formData, clinic_number: e.target.value})}
                    placeholder="e.g. CLN-001"
                    required
                  />
                  <small>Patient can use this at any clinic</small>
                </div>
                <div className="form-group">
                  <label>Nurse Number <span style={{color:'#ef4444'}}>*</span></label>
                  <input
                    type="text"
                    value={formData.nurse_number}
                    onChange={(e) => setFormData({...formData, nurse_number: e.target.value})}
                    placeholder="e.g. NRS-045"
                    required
                  />
                  <small>Nurse dispensing the medication</small>
                </div>
              </div>

              <div className="form-group">
                <label>Dispensing Clinic Name (Optional)</label>
                <input
                  type="text"
                  value={formData.dispensing_clinic}
                  onChange={(e) => setFormData({...formData, dispensing_clinic: e.target.value})}
                  placeholder="e.g. Sakubva Clinic, Mutare"
                />
                <small>Leave blank if picking up at their registered clinic</small>
              </div>

              {/* Dates */}
              <div className="pickup-section-title" style={{marginTop:'1rem'}}>📅 Pickup Schedule</div>
              <div className="form-row">
                <div className="form-group">
                  <label>Pickup Date</label>
                  <input 
                    type="date" 
                    value={formData.pickup_date}
                    onChange={(e) => setFormData({...formData, pickup_date: e.target.value})}
                    required 
                  />
                </div>
                <div className="form-group">
                  <label>Next Appointment</label>
                  <input 
                    type="date" 
                    value={formData.next_pickup_date}
                    onChange={(e) => setFormData({...formData, next_pickup_date: e.target.value})}
                    required 
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Notes (Optional)</label>
                <textarea 
                  rows="2"
                  value={formData.notes}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  placeholder="Condition notes, adherence issues, etc."
                  style={{ width: '100%' }}
                />
              </div>

              <div className="form-actions">
                <button type="button" className="cancel-button" onClick={onClose}>Cancel</button>
                <button type="submit" className="submit-button" disabled={loading}>
                  {loading ? 'Recording...' : '✅ Confirm Pickup'}
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