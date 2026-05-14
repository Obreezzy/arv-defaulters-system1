import React, { useState, useEffect } from 'react';
import './Patients.css';
import { patientsAPI } from '../services/api';
import { useNotifications } from '../contexts/NotificationContext';
import PatientFormModal from './PatientForm';
import PatientDetailsModal from './PatientDetailsModal';
import PatientEditForm from './PatientEditForm';

function Patients({ initialRiskFilter = 'All', currentUser }) {
  const { showToast } = useNotifications();

  const [patients, setPatients]               = useState([]);
  const [loading, setLoading]                 = useState(true);
  const [analyzing, setAnalyzing]             = useState(false);
  const [showModal, setShowModal]             = useState(false);
  const [riskFilter, setRiskFilter]           = useState(initialRiskFilter);
  const [searchQuery, setSearchQuery]         = useState('');
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [editingPatient, setEditingPatient]   = useState(null);

  useEffect(() => {
    setRiskFilter(initialRiskFilter);
  }, [initialRiskFilter]);

  useEffect(() => {
    loadPatients();
  }, []);

  const loadPatients = async () => {
    try {
      setLoading(true);
      const res = await patientsAPI.getAllPatients();
      setPatients(res.data || []);
      setLoading(false);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  const runPrediction = async () => {
    if (patients.length === 0) {
      showToast({ type: 'warning', message: 'No patients to analyse. Register patients first.' });
      return;
    }
    try {
      setAnalyzing(true);
      showToast({ type: 'info', message: '🔮 Running Predictive Analysis...' });
      await patientsAPI.predictRisk([]);
      showToast({ type: 'success', message: 'Prediction Complete! Updating list...' });
      await loadPatients();
    } catch (err) {
      showToast({ type: 'error', message: 'Analysis Failed' });
    } finally {
      setAnalyzing(false);
    }
  };



  const getEffectiveRisk = (patient) => {
    const score = parseFloat(patient.risk_score) || 0;
    const label = score >= 50 ? 'High' : score >= 25 ? 'Medium' : 'Low';
    return { score, label, boosted: false, boost: 0 };
  };

  const getRiskClass = (label) => {
    switch (label?.toLowerCase()) {
      case 'high':   return 'risk-high';
      case 'medium': return 'risk-medium';
      default:       return 'risk-low';
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Not Set';
    const d = new Date(dateStr);
    return (
      String(d.getDate()).padStart(2, '0') + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      d.getFullYear()
    );
  };

  const getPickupStatus = (dateStr) => {
    if (!dateStr) return null;
    const today  = new Date(); today.setHours(0, 0, 0, 0);
    const pickup = new Date(dateStr); pickup.setHours(0, 0, 0, 0);
    const diff   = Math.ceil((pickup - today) / (1000 * 60 * 60 * 24));
    if (diff < 0)  return 'overdue';
    if (diff <= 3) return 'soon';
    return 'normal';
  };

  const filteredPatients = patients.filter(p => {
    const effective     = getEffectiveRisk(p);
    const matchesRisk   = riskFilter === 'All' ||
      effective.label.toLowerCase() === riskFilter.toLowerCase();
    const s             = searchQuery.toLowerCase();
    const matchesSearch =
      (p.first_name?.toLowerCase()     || '').includes(s) ||
      (p.last_name?.toLowerCase()      || '').includes(s) ||
      (p.patient_number?.toLowerCase() || '').includes(s) ||
      (p.phone_number?.toLowerCase()   || '').includes(s);
    return matchesRisk && matchesSearch;
  });

  return (
    <div className="patients-page">


      <div className="page-header">
        <div className="header-content">
          <h2 className="page-title">Patient Registry</h2>
          <p className="page-subtitle">
            Showing: {filteredPatients.length}{' '}
            {riskFilter !== 'All' ? riskFilter + ' Risk ' : ''}Patients
          </p>
        </div>
        <div className="header-actions">
          <div className="search-container">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              className="search-input"
              placeholder="Search name, ID, or phone..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button className="clear-search" onClick={() => setSearchQuery('')}>✕</button>
            )}
          </div>

          <select
            className="filter-dropdown"
            value={riskFilter}
            onChange={e => setRiskFilter(e.target.value)}
          >
            <option value="All">All Patients</option>
            <option value="High">High Risk Only</option>
            <option value="Medium">Medium Risk Only</option>
            <option value="Low">Low Risk Only</option>
          </select>

          <button
            className={'btn-predict' + (analyzing || patients.length === 0 ? ' disabled' : '')}
            onClick={runPrediction}
            disabled={analyzing || patients.length === 0}
          >
            <span className="icon">{analyzing ? '⏳' : '🔮'}</span>
            {analyzing ? 'Analyzing...' : 'Predict Risks'}
          </button>

          <button className="btn-add-patient" onClick={() => setShowModal(true)}>
            + New Patient
          </button>
        </div>
      </div>

      <div className="table-container">
        <div className="table-scroll">
          {filteredPatients.length === 0 && !loading ? (
            <div className="empty-state">
              <h3>No patients found</h3>
              <p>
                {searchQuery
                  ? 'No results match "' + searchQuery + '".'
                  : 'No patients matching "' + riskFilter + '" risk filter.'}
              </p>
              <button
                className="btn-show-all"
                onClick={() => { setRiskFilter('All'); setSearchQuery(''); }}
              >
                Clear Filters &amp; Show All
              </button>
            </div>
          ) : (
            <table className="patients-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Age</th>
                  <th>Distance</th>
                  <th>Next Pickup</th>
                  <th>Predicted Risk</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPatients.map(p => {
                  const age = p.date_of_birth
                    ? new Date().getFullYear() - new Date(p.date_of_birth).getFullYear()
                    : 'N/A';
                  const effective     = getEffectiveRisk(p);
                  const riskClass     = getRiskClass(effective.label);
                  const pickupStatus  = getPickupStatus(p.next_pickup_date);

                  return (
                    <tr
                      key={p.patient_id}
                      
                    >
                      <td>{p.patient_number}</td>
                      <td className="fw-bold">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          {p.first_name} {p.last_name}
                        </div>
                      </td>
                      <td>{age}</td>
                      <td>
                        {p.distance_from_clinic
                          ? Math.round(Number(p.distance_from_clinic)) + ' km'
                          : 'Unknown'}
                      </td>
                      <td>
                        {p.next_pickup_date ? (
                          <span className={'pickup-badge pickup-' + pickupStatus}>
                            {pickupStatus === 'overdue' && '⚠️ '}
                            {pickupStatus === 'soon'    && '🔔 '}
                            {formatDate(p.next_pickup_date)}
                          </span>
                        ) : (
                          <span className="pickup-badge pickup-none">Not Set</span>
                        )}
                      </td>
                      <td>
                        <div className="risk-meter-wrapper">
                          <div className="risk-track">
                            <div
                              className={'risk-fill ' + riskClass}
                              style={{ width: effective.score + '%' }}
                            />
                          </div>
                          <span className={'risk-score-text ' + riskClass}>
                            {effective.score}%
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className={'status-badge ' + (p.is_active ? 'active' : 'inactive')}>
                          {p.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>
                        <div className="action-buttons">
                          <button
                            className="btn-icon view"
                            title="View Details"
                            onClick={() => setSelectedPatient(p)}
                          >
                            👁️
                          </button>
                          <button
                            className="btn-icon edit"
                            title="Edit Patient"
                            onClick={() => setEditingPatient(p)}
                          >
                            ✏️
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showModal && (
        <PatientFormModal
          onClose={() => setShowModal(false)}
          onSuccess={loadPatients}
          currentUser={currentUser}
        />
      )}

      {selectedPatient && (
        <PatientDetailsModal
          patient={selectedPatient}
          onClose={() => setSelectedPatient(null)}
          onEdit={p => { setSelectedPatient(null); setEditingPatient(p); }}
        />
      )}

      {editingPatient && (
        <PatientEditForm
          patient={editingPatient}
          onClose={() => setEditingPatient(null)}
          onSuccess={() => { setEditingPatient(null); loadPatients(); }}
        />
      )}

    </div>
  );
}

export default Patients;