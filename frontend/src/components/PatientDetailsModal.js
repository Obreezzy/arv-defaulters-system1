import React, { useState, useEffect } from 'react';
import { X, Pencil, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import './PatientDetailsModal.css'; 
import { pickupsAPI } from '../services/api';

function PatientDetailsModal({ patient, onClose, onEdit }) {
 const [activeTab, setActiveTab] = useState('overview');
 const [pickups, setPickups] = useState([]);
 const [loadingHistory, setLoadingHistory] = useState(false);

 // Fetch pickup history only when the History tab is clicked
 useEffect(() => {
 if (activeTab === 'history') {
 loadHistory();
 }
 }, [activeTab]);

 const loadHistory = async () => {
 try {
 setLoadingHistory(true);
 const res = await pickupsAPI.getPatientPickups(patient.patient_id);
 // Backend returns { success, count, pickups: [...] } — not res.data
 setPickups(res.pickups || res.data || []);
 } catch (err) {
 console.error("Failed to load history", err);
 } finally {
 setLoadingHistory(false);
 }
 };

 if (!patient) return null;

 const getRiskFactors = () => {
 if (!patient.risk_factors) return [];
 if (Array.isArray(patient.risk_factors)) return patient.risk_factors;
 try { return JSON.parse(patient.risk_factors); } catch (e) { return []; }
 };

 const riskFactors = getRiskFactors();
 const riskScore = patient.risk_score || 0;

 const getRiskColor = (score) => {
 if (score >= 60) return '#ef4444'; // Red
 if (score >= 30) return '#f59e0b'; // Orange
 return '#10b981'; // Green
 };

 const riskColor = getRiskColor(riskScore);

 return (
 <div className="modal-overlay">
 <div className="modal-content">
 <div className="modal-header" style={{ paddingBottom: '1rem', borderBottom: 'none' }}>
 <div>
 <h2 className="modal-title">Patient Profile</h2>
 <p className="modal-subtitle">ID: {patient.patient_number} | {patient.patient_name || patient.first_name + ' ' + patient.last_name}</p>
 </div>
 <button className="close-btn" onClick={onClose}><X size={18} /></button>
 </div>

 {/* TABS */}
 <div className="modal-tabs">
 <button 
 className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`} 
 onClick={() => setActiveTab('overview')}
 >
 AI Overview
 </button>
 <button 
 className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`} 
 onClick={() => setActiveTab('history')}
 >
 Pickup History
 </button>
 </div>

 <div className="modal-body custom-scrollbar">
 
 {/* TAB 1: OVERVIEW */}
 {activeTab === 'overview' && (
 <>
 <div className="info-grid">
 <div className="info-item">
 <label>Phone Contact</label>
 <p>{patient.phone_number || patient.phone || 'N/A'}</p>
 </div>
 <div className="info-item">
 <label>Distance from Clinic</label>
 <p>{patient.distance_from_clinic ? `${patient.distance_from_clinic} km` : 'Unknown'}</p>
 </div>
 <div className="info-item">
 <label>Regimen</label>
 <p>{patient.arv_regimen || 'Standard'}</p>
 </div>
 <div className="info-item">
 <label>Status</label>
 <p>{patient.is_active ? ' Active' : ' Inactive'}</p>
 </div>
 {/* Display Chronics here */}
 <div className="info-item">
 <label>Chronic Conditions</label>
 <p>{patient.chronic_diseases || 'None'}</p>
 </div>
 </div>

 <hr className="divider" />

 <div className="risk-section">
 <div className="risk-header">
 <h3> Smart Risk Analysis</h3>
 <span className="risk-badge" style={{ backgroundColor: riskColor }}>
 {patient.risk_level ? patient.risk_level.toUpperCase() : 'UNKNOWN'} RISK
 </span>
 </div>

 <div className="risk-meter-container">
 <div className="risk-score-label">
 <span>Predicted Default Probability</span>
 <span style={{ color: riskColor, fontWeight: 'bold' }}>{riskScore}%</span>
 </div>
 <div className="progress-bar-bg">
 <div 
 className="progress-bar-fill" 
 style={{ width: `${riskScore}%`, backgroundColor: riskColor }}
 ></div>
 </div>
 </div>

 <div className="risk-factors-box">
 <h4>Why is this patient at risk?</h4>
 {riskFactors.length > 0 ? (
 <ul className="factors-list">
 {riskFactors.map((factor, index) => (
 <li key={index}> {factor}</li>
 ))}
 </ul>
 ) : (
 <p className="no-risk"> No specific risk factors detected.</p>
 )}
 </div>
 </div>
 </>
 )}

 {/* TAB 2: TIMELINE HISTORY */}
 {activeTab === 'history' && (
 <div className="history-section">
 {loadingHistory ? (
 <p style={{ textAlign: 'center', color: '#6b7280', padding: '2rem' }}>Loading medical history...</p>
 ) : pickups.length === 0 ? (
 <div className="empty-history">
 <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '1rem' }}></span>
 <p>No pickups recorded for this patient yet.</p>
 </div>
 ) : (
 <div className="timeline">
 {pickups.map((pickup, index) => {
 const actualDate = new Date(pickup.actual_pickup_date);
 const scheduledDate = new Date(pickup.next_pickup_date);

 // isRecent = most recent pickup (index 0, sorted DESC)
 const isRecent = index === 0;

 // Correct late logic:
 // A pickup is late if the actual pickup date is AFTER
 // the PREVIOUS record's next_pickup_date (i.e. what was scheduled)
 // pickups are sorted DESC so previous scheduled = pickups[index+1].next_pickup_date
 const prevRecord = pickups[index + 1];
 const scheduledForThisVisit = prevRecord
 ? new Date(prevRecord.next_pickup_date)
 : null;
 const isLate = scheduledForThisVisit
 ? actualDate > scheduledForThisVisit
 : false;
 
 // Days late calculation
 const daysLate = scheduledForThisVisit && isLate
 ? Math.floor((actualDate - scheduledForThisVisit) / (1000 * 60 * 60 * 24))
 : 0;

 return (
 <div className="timeline-item" key={pickup.pickup_id || index}>
 <div className={`timeline-marker ${isLate ? 'late' : 'on-time'}`}></div>
 <div className="timeline-content">
 <div className="timeline-header">
 <strong>{actualDate.toLocaleDateString('en-GB')}</strong>
 <div style={{ display: 'flex', gap: '0.5rem' }}>
 {isLate && <span className="badge-late"><AlertTriangle size={12} /> {daysLate}d Late</span>}
 {!isLate && scheduledForThisVisit && <span className="badge-ontime"><CheckCircle size={12} /> On Time</span>}
 {isRecent && <span className="badge-new"><Clock size={12} /> Latest</span>}
 </div>
 </div>
 {scheduledForThisVisit && (
 <p><strong>Was scheduled for:</strong> {scheduledForThisVisit.toLocaleDateString('en-GB')} {isLate ? <span style={{color:'#ef4444'}}>({daysLate} day{daysLate !== 1 ? 's' : ''} late)</span> : <span style={{color:'#10b981'}}>(on time)</span>}</p>
 )}
 <p><strong>Next appointment:</strong> {scheduledDate.toLocaleDateString('en-GB')}</p>
 {pickup.quantity_dispensed && (
 <p><strong>Dispensed:</strong> {pickup.quantity_dispensed}</p>
 )}
 {pickup.notes && <p className="timeline-notes"> "{pickup.notes}"</p>}
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