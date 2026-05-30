import React, { useState, useEffect } from 'react';
import { Search, Eye, Pencil, TrendingUp, UserPlus, Loader2, Brain } from 'lucide-react';
import './Patients.css';
import { patientsAPI } from '../services/api';
import { useNotifications } from '../contexts/NotificationContext';
import PatientForm from './PatientForm';
import PatientDetailsModal from './PatientDetailsModal';
import PatientEditForm from './PatientEditForm';

function Patients({ initialRiskFilter = 'All', currentUser }) {
    const { showToast } = useNotifications();

    const [patients, setPatients]         = useState([]);
    const [loading, setLoading]           = useState(true);
    const [analyzing, setAnalyzing]       = useState(false);
    const [scoringId, setScoringId]       = useState(null); // single patient scoring
    const [showModal, setShowModal]       = useState(false);
    const [riskFilter, setRiskFilter]     = useState(initialRiskFilter);
    const [searchQuery, setSearchQuery]   = useState('');
    const [selectedPatient, setSelectedPatient] = useState(null);
    const [editingPatient, setEditingPatient]   = useState(null);

    useEffect(() => { setRiskFilter(initialRiskFilter); }, [initialRiskFilter]);
    useEffect(() => { loadPatients(); }, []);

    const loadPatients = async () => {
        try {
            setLoading(true);
            const res = await patientsAPI.getAllPatients();
            setPatients(res.data || []);
        } catch (err) {
            console.error(err);
            showToast({ type: 'error', message: 'Failed to load patients' });
        } finally {
            setLoading(false);
        }
    };

    // Run AI prediction for ALL patients
    const runPrediction = async () => {
        if (patients.length === 0) {
            showToast({ type: 'warning', message: 'No patients to analyse.' });
            return;
        }
        try {
            setAnalyzing(true);
            showToast({ type: 'info', message: '🤖 Running AI Risk Analysis...' });
            await patientsAPI.predictRisk([]);
            showToast({ type: 'success', message: '✅ Analysis complete! Scores updated.' });
            await loadPatients();
        } catch (err) {
            showToast({ type: 'error', message: 'Analysis failed: ' + err.message });
        } finally {
            setAnalyzing(false);
        }
    };

    // Run AI prediction for a single patient
    const scoreOne = async (patientId) => {
        try {
            setScoringId(patientId);
            const res = await patientsAPI.predictOne(patientId);
            showToast({
                type: 'success',
                message: `Risk: ${res.risk?.label} (${Math.round((res.risk?.probability || 0) * 100)}%)`
            });
            await loadPatients();
        } catch (err) {
            showToast({ type: 'error', message: 'Scoring failed: ' + err.message });
        } finally {
            setScoringId(null);
        }
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
        return String(d.getDate()).padStart(2,'0') + '-' +
               String(d.getMonth()+1).padStart(2,'0') + '-' +
               d.getFullYear();
    };

    const getPickupStatus = (dateStr) => {
        if (!dateStr) return null;
        const today = new Date(); today.setHours(0,0,0,0);
        const pickup = new Date(dateStr); pickup.setHours(0,0,0,0);
        const diff = Math.ceil((pickup - today) / (1000*60*60*24));
        if (diff < 0)  return 'overdue';
        if (diff <= 3) return 'soon';
        return 'normal';
    };

    const filteredPatients = patients.filter(p => {
        const matchesRisk = riskFilter === 'All' ||
            (p.risk_level || '').toLowerCase() === riskFilter.toLowerCase();
        const s = searchQuery.toLowerCase();
        const matchesSearch =
            (p.patient_id?.toLowerCase() || '').includes(s) ||
            (p.residence_district?.toLowerCase() || '').includes(s) ||
            (p.facility_name?.toLowerCase() || '').includes(s);
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
                        <Search size={16} />
                        <input
                            type="text"
                            className="search-input"
                            placeholder="Search ID, district, facility..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>

                    <select className="filter-dropdown" value={riskFilter} onChange={e => setRiskFilter(e.target.value)}>
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
                        <Brain size={15} />
                        {analyzing ? 'Analyzing...' : 'Predict Risks'}
                    </button>

                    <button className="btn-add-patient" onClick={() => setShowModal(true)}>
                        <UserPlus size={16} /> New Patient
                    </button>
                </div>
            </div>

            <div className="table-container">
                <div className="table-scroll">
                    {loading ? (
                        <div className="empty-state">
                            <Loader2 size={32} className="spin" />
                            <p>Loading patients...</p>
                        </div>
                    ) : filteredPatients.length === 0 ? (
                        <div className="empty-state">
                            <h3>No patients found</h3>
                            <button className="btn-show-all" onClick={() => { setRiskFilter('All'); setSearchQuery(''); }}>
                                Clear Filters
                            </button>
                        </div>
                    ) : (
                        <table className="patients-table">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Sex</th>
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
                                    const pickupStatus = getPickupStatus(p.next_pickup_date);
                                    const riskClass    = getRiskClass(p.risk_level);
                                    const riskScore    = p.risk_score || 0;

                                    return (
                                        <tr key={p.patient_id}>
                                            <td>{p.patient_id}</td>
                                            <td>{p.sex === 'F' ? 'Female' : p.sex === 'M' ? 'Male' : 'N/A'}</td>
                                            <td>{p.age || 'N/A'}</td>
                                            <td>{p.distance_km != null ? `${p.distance_km} km` : 'N/A'}</td>
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
                                                {p.risk_level ? (
                                                    <div className="risk-meter-wrapper">
                                                        <div className="risk-track">
                                                            <div className={`risk-fill ${riskClass}`} style={{ width: `${riskScore}%` }} />
                                                        </div>
                                                        <span className={`risk-score-text ${riskClass}`}>{riskScore}%</span>
                                                    </div>
                                                ) : (
                                                    <span style={{ color: '#9ca3af', fontSize: '0.8rem' }}>Not scored</span>
                                                )}
                                            </td>
                                            <td>
                                                <span className={`status-badge ${p.is_active ? 'active' : 'inactive'}`}>
                                                    {p.is_active ? 'Active' : 'Inactive'}
                                                </span>
                                            </td>
                                            <td>
                                                <div className="action-buttons">
                                                    <button className="btn-icon view" title="View Details" onClick={() => setSelectedPatient(p)}>
                                                        <Eye size={15} />
                                                    </button>
                                                    <button className="btn-icon edit" title="Edit Patient" onClick={() => setEditingPatient(p)}>
                                                        <Pencil size={15} />
                                                    </button>
                                                    <button
                                                        className="btn-icon"
                                                        title="Run AI Risk Score"
                                                        onClick={() => scoreOne(p.patient_id)}
                                                        disabled={scoringId === p.patient_id}
                                                        style={{ color: '#8b5cf6' }}
                                                    >
                                                        {scoringId === p.patient_id
                                                            ? <Loader2 size={15} className="spin" />
                                                            : <Brain size={15} />
                                                        }
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
                <PatientForm
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