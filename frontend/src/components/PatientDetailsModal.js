import React, { useState, useEffect } from 'react';
import { X, Pencil, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import './PatientDetailsModal.css';
import { pickupsAPI } from '../services/api';

/**
 * PatientDetailsModal.js — rewritten for new schema.
 * No first_name/last_name — displays patient_id, sex, age, distance_km, etc.
 */
function PatientDetailsModal({ patient, onClose, onEdit }) {
    const [activeTab, setActiveTab] = useState('overview');
    const [pickups, setPickups] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(false);

    useEffect(() => {
        if (activeTab === 'history') {
            loadHistory();
        }
    }, [activeTab]);

    const loadHistory = async () => {
        try {
            setLoadingHistory(true);
            const res = await pickupsAPI.getPatientPickups(patient.patient_id);
            setPickups(res.pickups || res.data || []);
        } catch (err) {
            console.error('Failed to load history', err);
        } finally {
            setLoadingHistory(false);
        }
    };

    if (!patient) return null;

    const riskScore = patient.risk_score ?? 0;
    const riskLevel = patient.risk_level || 'Unknown';

    const getRiskColor = (score) => {
        if (score >= 60) return '#ef4444';
        if (score >= 30) return '#f59e0b';
        return '#10b981';
    };
    const riskColor = getRiskColor(riskScore);

    const fmt = (dateStr) => dateStr ? new Date(dateStr).toLocaleDateString('en-GB') : 'N/A';

    const labelMap = {
        sex:                  { label: 'Sex', render: v => v === 'F' ? 'Female' : v === 'M' ? 'Male' : v },
        age:                  { label: 'Age', render: v => v ? `${v} years` : 'N/A' },
        distance_km:          { label: 'Distance from Clinic', render: v => v != null ? `${v} km` : 'N/A' },
        facility_name:        { label: 'Facility', render: v => v || 'N/A' },
        catchment_type:       { label: 'Catchment Type', render: v => v || 'N/A' },
        phone_available:      { label: 'Phone Available', render: v => v || 'N/A' },
        marital_status:       { label: 'Marital Status', render: v => v || 'N/A' },
        education_level:      { label: 'Education', render: v => v || 'N/A' },
        occupation:           { label: 'Occupation', render: v => v || 'N/A' },
        disclosure_status:    { label: 'Disclosure Status', render: v => v || 'N/A' },
        art_start_date:       { label: 'ART Start Date', render: v => fmt(v) },
        next_pickup_date:     { label: 'Next Pickup', render: v => fmt(v) },
        regimen:              { label: 'Regimen', render: v => v || 'N/A' },
        who_stage_at_enrolment: { label: 'WHO Stage', render: v => v ? `Stage ${v}` : 'N/A' },
        baseline_cd4:         { label: 'Baseline CD4', render: v => v ? `${v} copies/mL` : 'N/A' },
    };

    const overviewFields = [
        'sex', 'age', 'distance_km', 'facility_name',
        'phone_available', 'marital_status', 'education_level', 'occupation',
    ];

    const clinicalFields = [
        'art_start_date', 'next_pickup_date', 'regimen',
        'who_stage_at_enrolment', 'baseline_cd4', 'disclosure_status', 'catchment_type',
    ];

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <div className="modal-header" style={{ paddingBottom: '1rem', borderBottom: 'none' }}>
                    <div>
                        <h2 className="modal-title">Patient Profile</h2>
                        <p className="modal-subtitle">ID: {patient.patient_id} | {patient.residence_district || 'District N/A'}</p>
                    </div>
                    <button className="close-btn" onClick={onClose}><X size={18} /></button>
                </div>

                {/* TABS */}
                <div className="modal-tabs">
                    <button className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>
                        AI Overview
                    </button>
                    <button className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>
                        Visit History
                    </button>
                </div>

                <div className="modal-body custom-scrollbar">

                    {/* TAB 1: OVERVIEW */}
                    {activeTab === 'overview' && (
                        <>
                            {/* Demographics grid */}
                            <div className="info-grid">
                                {overviewFields.map(field => {
                                    const meta = labelMap[field];
                                    if (!meta) return null;
                                    return (
                                        <div className="info-item" key={field}>
                                            <label>{meta.label}</label>
                                            <p>{meta.render(patient[field])}</p>
                                        </div>
                                    );
                                })}
                            </div>

                            <hr className="divider" />

                            {/* Clinical grid */}
                            <div className="info-grid">
                                {clinicalFields.map(field => {
                                    const meta = labelMap[field];
                                    if (!meta) return null;
                                    return (
                                        <div className="info-item" key={field}>
                                            <label>{meta.label}</label>
                                            <p>{meta.render(patient[field])}</p>
                                        </div>
                                    );
                                })}
                            </div>

                            <hr className="divider" />

                            {/* AI Risk Section */}
                            <div className="risk-section">
                                <div className="risk-header">
                                    <h3>🤖 Smart Risk Analysis</h3>
                                    <span className="risk-badge" style={{ backgroundColor: riskColor }}>
                                        {riskLevel.toUpperCase()} RISK
                                    </span>
                                </div>

                                {riskScore > 0 ? (
                                    <div className="risk-meter-container">
                                        <div className="risk-score-label">
                                            <span>Predicted Default Probability</span>
                                            <span style={{ color: riskColor, fontWeight: 'bold' }}>{riskScore}%</span>
                                        </div>
                                        <div className="progress-bar-bg">
                                            <div className="progress-bar-fill" style={{ width: `${riskScore}%`, backgroundColor: riskColor }}></div>
                                        </div>
                                    </div>
                                ) : (
                                    <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>
                                        Not yet scored. Click <strong>Predict Risks</strong> on the Patient Registry to run the AI analysis.
                                    </p>
                                )}
                            </div>
                        </>
                    )}

                    {/* TAB 2: VISIT HISTORY */}
                    {activeTab === 'history' && (
                        <div className="history-section">
                            {loadingHistory ? (
                                <p style={{ textAlign: 'center', color: '#6b7280', padding: '2rem' }}>Loading visit history...</p>
                            ) : pickups.length === 0 ? (
                                <div className="empty-history">
                                    <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '1rem' }}>📋</span>
                                    <p>No visits recorded for this patient yet.</p>
                                </div>
                            ) : (
                                <div className="timeline">
                                    {pickups.map((visit, index) => {
                                        const visitDate = new Date(visit.visit_date);
                                        const nextAppt  = visit.scheduled_next_appt_date ? new Date(visit.scheduled_next_appt_date) : null;
                                        const isRecent  = index === 0;

                                        // Check if this visit was late vs previous scheduled appt
                                        const prevVisit = pickups[index + 1];
                                        const prevScheduled = prevVisit?.scheduled_next_appt_date ? new Date(prevVisit.scheduled_next_appt_date) : null;
                                        const isLate = prevScheduled ? visitDate > prevScheduled : false;
                                        const daysLate = isLate ? Math.floor((visitDate - prevScheduled) / (1000 * 60 * 60 * 24)) : 0;

                                        return (
                                            <div className="timeline-item" key={visit.visit_id || index}>
                                                <div className={`timeline-marker ${isLate ? 'late' : 'on-time'}`}></div>
                                                <div className="timeline-content">
                                                    <div className="timeline-header">
                                                        <strong>{visitDate.toLocaleDateString('en-GB')}</strong>
                                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                            {isLate && <span className="badge-late"><AlertTriangle size={12} /> {daysLate}d Late</span>}
                                                            {!isLate && prevScheduled && <span className="badge-ontime"><CheckCircle size={12} /> On Time</span>}
                                                            {isRecent && <span className="badge-new"><Clock size={12} /> Latest</span>}
                                                        </div>
                                                    </div>
                                                    {prevScheduled && (
                                                        <p><strong>Was scheduled for:</strong> {prevScheduled.toLocaleDateString('en-GB')}
                                                            {isLate
                                                                ? <span style={{ color: '#ef4444' }}> ({daysLate} day{daysLate !== 1 ? 's' : ''} late)</span>
                                                                : <span style={{ color: '#10b981' }}> (on time)</span>}
                                                        </p>
                                                    )}
                                                    {nextAppt && <p><strong>Next appointment:</strong> {nextAppt.toLocaleDateString('en-GB')}</p>}
                                                    {visit.days_dispensed && <p><strong>Days dispensed:</strong> {visit.days_dispensed}</p>}
                                                    {visit.regimen && <p><strong>Regimen:</strong> {visit.regimen}</p>}
                                                    {visit.viral_load_result && <p><strong>Viral Load:</strong> {visit.viral_load_result}</p>}
                                                    {visit.dsd_model && <p><strong>DSD Model:</strong> {visit.dsd_model}</p>}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="modal-footer">
                    <button className="btn-secondary" onClick={onClose}>Close</button>
                    <button className="btn-primary" onClick={() => onEdit(patient)}><Pencil size={15} /> Edit Details</button>
                </div>
            </div>
        </div>
    );
}

export default PatientDetailsModal;