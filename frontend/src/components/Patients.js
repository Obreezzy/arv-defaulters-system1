import React, { useState, useEffect } from 'react';
import './Patients.css'; 
import { patientsAPI } from '../services/api'; 
import { useNotifications } from '../contexts/NotificationContext';
import PatientFormModal from './PatientForm';
import PatientDetailsModal from './PatientDetailsModal'; 
import PatientEditForm from './PatientEditForm';   

function Patients({ initialRiskFilter = 'All' }) {
  const { showToast } = useNotifications();
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  
  // Filters State
  const [riskFilter, setRiskFilter] = useState(initialRiskFilter);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [selectedPatient, setSelectedPatient] = useState(null); 
  const [editingPatient, setEditingPatient] = useState(null);   

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
    // Do nothing if there are no patients to analyse
    if (patients.length === 0) {
      showToast({ type: 'warning', message: 'No patients to analyse. Register patients first.' });
      return;
    }

    try {
        setAnalyzing(true);
        showToast({ type: 'info', message: '🔮 Running Predictive Analysis...' });
        
        await patientsAPI.predictRisk(); 
        
        showToast({ type: 'success', message: 'Prediction Complete! Updating list...' });
        await loadPatients(); 
    } catch (err) {
        showToast({ type: 'error', message: 'Analysis Failed' });
        console.error(err);
    } finally {
        setAnalyzing(false);
    }
  };

  const getRiskClass = (level) => {
      switch(level?.toLowerCase()) {
          case 'high': return 'risk-high';
          case 'medium': return 'risk-medium';
          default: return 'risk-low';
      }
  };

  // Format date from YYYY-MM-DD to DD-MM-YYYY
  const formatDate = (dateStr) => {
    if (!dateStr) return 'Not Set';
    const date = new Date(dateStr);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  };

  // Determine if pickup is overdue, upcoming, or normal
  const getPickupStatus = (dateStr) => {
    if (!dateStr) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const pickup = new Date(dateStr);
    pickup.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((pickup - today) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return 'overdue';
    if (diffDays <= 3) return 'soon';
    return 'normal';
  };

  // Filter by BOTH Risk Level AND Search Query
  const filteredPatients = patients.filter(p => {
      const matchesRisk = riskFilter === 'All' || p.risk_level?.toLowerCase() === riskFilter.toLowerCase();
      
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = 
          (p.first_name?.toLowerCase() || '').includes(searchLower) ||
          (p.last_name?.toLowerCase() || '').includes(searchLower) ||
          (p.patient_number?.toLowerCase() || '').includes(searchLower) ||
          (p.phone_number?.toLowerCase() || '').includes(searchLower);

      return matchesRisk && matchesSearch;
  });

  return (
    <div className="patients-page">
      <div className="page-header">
        <div className="header-content">
            <h2 className="page-title">Patient Registry</h2>
            <p className="page-subtitle">
                Showing: {filteredPatients.length} {riskFilter !== 'All' ? `${riskFilter} Risk ` : ''}Patients
            </p>
        </div>
        <div className="header-actions">
            
            {/* Search Bar */}
            <div className="search-container">
                <span className="search-icon">🔍</span>
                <input 
                    type="text" 
                    className="search-input" 
                    placeholder="Search name, ID, or phone..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                    <button className="clear-search" onClick={() => setSearchQuery('')}>✕</button>
                )}
            </div>

            <select 
                className="filter-dropdown"
                value={riskFilter}
                onChange={(e) => setRiskFilter(e.target.value)}
            >
                <option value="All">All Patients</option>
                <option value="High">High Risk Only</option>
                <option value="Medium">Medium Risk Only</option>
                <option value="Low">Low Risk Only</option>
            </select>

            <button 
                className={`btn-predict ${(analyzing || patients.length === 0) ? 'disabled' : ''}`}
                onClick={runPrediction} 
                disabled={analyzing || patients.length === 0}
                title={patients.length === 0 ? 'No patients to analyse' : 'Run risk prediction'}
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
                        ? `No results match "${searchQuery}" in the current filter.` 
                        : `There are no patients matching the "${riskFilter}" risk filter.`}
                </p>
                <button 
                    className="btn-show-all" 
                    onClick={() => { setRiskFilter('All'); setSearchQuery(''); }}
                >
                    Clear Filters & Show All
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
                        const age = p.date_of_birth ? new Date().getFullYear() - new Date(p.date_of_birth).getFullYear() : 'N/A';
                        const riskClass = getRiskClass(p.risk_level);
                        const riskScore = p.risk_score || 0;
                        const pickupStatus = getPickupStatus(p.next_pickup_date);
                        
                        return (
                            <tr key={p.patient_id}>
                                <td>{p.patient_number}</td>
                                <td className="fw-bold">{p.first_name} {p.last_name}</td>
                                <td>{age}</td>
                                <td>{p.distance_from_clinic ? `${p.distance_from_clinic} km` : 'Unknown'}</td>
                                <td>
                                  {p.next_pickup_date ? (
                                    <span className={`pickup-badge pickup-${pickupStatus}`}>
                                      {pickupStatus === 'overdue' && '⚠️ '}
                                      {pickupStatus === 'soon' && '🔔 '}
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
                                                className={`risk-fill ${riskClass}`} 
                                                style={{ width: `${riskScore}%` }} 
                                            ></div>
                                        </div>
                                        <span className={`risk-score-text ${riskClass}`}>
                                            {riskScore}%
                                        </span>
                                    </div>
                                </td>
                                <td>
                                    <span className={`status-badge ${p.is_active ? 'active' : 'inactive'}`}>
                                        {p.is_active ? 'Active' : 'Inactive'}
                                    </span>
                                </td>
                                <td>
                                    <div className="action-buttons">
                                        <button className="btn-icon view" title="View Details" onClick={() => setSelectedPatient(p)}>👁️</button>
                                        <button className="btn-icon edit" title="Edit Patient" onClick={() => setEditingPatient(p)}>✏️</button>
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
      {showModal && <PatientFormModal onClose={() => setShowModal(false)} onSuccess={loadPatients} />}
      {selectedPatient && <PatientDetailsModal patient={selectedPatient} onClose={() => setSelectedPatient(null)} onEdit={(p) => { setSelectedPatient(null); setEditingPatient(p); }} />}
      {editingPatient && <PatientEditForm patient={editingPatient} onClose={() => setEditingPatient(null)} onSuccess={() => { setEditingPatient(null); loadPatients(); }} />}
    </div>
  );
}

export default Patients;