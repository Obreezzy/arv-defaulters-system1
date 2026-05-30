import React, { useState, useEffect } from 'react';
import { RefreshCw, Loader2, Pill, CheckCircle } from 'lucide-react';
import './Defaulters.css';
import { defaultersAPI } from '../services/api';
import { useNotifications } from '../contexts/NotificationContext';
import PickupForm from './PickupForm';

/**
 * Defaulters.js — rewritten for new schema.
 * No first_name/last_name — uses patient_id.
 */
function Defaulters({ currentUser }) {
    const { showToast } = useNotifications();
    const [defaulters, setDefaulters]       = useState([]);
    const [loading, setLoading]             = useState(true);
    const [pickupPatient, setPickupPatient] = useState(null);

    useEffect(() => { loadDefaulters(); }, []);

    const loadDefaulters = async () => {
        try {
            setLoading(true);
            const res = await defaultersAPI.getAllDefaulters();
            setDefaulters(res.defaulters || res.data || []);
        } catch (err) {
            console.error(err);
            showToast({ type: 'error', message: 'Failed to load defaulters list' });
        } finally {
            setLoading(false);
        }
    };

    const getRiskClass = (level) => {
        switch (level?.toLowerCase()) {
            case 'high':   return 'risk-high';
            case 'medium': return 'risk-medium';
            case 'low':    return 'risk-low';
            default:       return 'risk-default';
        }
    };

    return (
        <div className="defaulters-page">
            <div className="page-header">
                <div className="header-content">
                    <h2 className="page-title">Defaulters Tracking</h2>
                    <p className="page-subtitle">
                        Patients who have missed their scheduled medication pickups.
                        {defaulters.length > 0 && (
                            <span style={{ marginLeft: '0.5rem', color: '#ef4444', fontWeight: '700' }}>
                                ({defaulters.length} active)
                            </span>
                        )}
                    </p>
                </div>
                <button className="btn-scan" onClick={loadDefaulters} disabled={loading}>
                    {loading ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
                    {loading ? 'Loading...' : 'Refresh'}
                </button>
            </div>

            <div className="table-container">
                <div className="table-scroll">
                    {loading ? (
                        <div className="empty-state">
                            <div className="empty-icon"><Loader2 size={40} /></div>
                            <h3>Loading defaulters...</h3>
                        </div>
                    ) : defaulters.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-icon"><CheckCircle size={40} color="#10b981" /></div>
                            <h3>No Defaulters Found</h3>
                            <p>All patients are currently up to date with their medication pickups.</p>
                        </div>
                    ) : (
                        <table className="defaulters-table">
                            <thead>
                                <tr>
                                    <th>Patient ID</th>
                                    <th>District</th>
                                    <th>Days Overdue</th>
                                    <th>Risk Level</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {defaulters.map(d => (
                                    <tr key={d.defaulter_id || d.patient_id}>
                                        <td className="fw-bold">
                                            {d.patient_id}
                                            {d.facility_name && (
                                                <div className="sub-text">{d.facility_name}</div>
                                            )}
                                        </td>
                                        <td>{d.residence_district || d.district || 'N/A'}</td>
                                        <td><span className="overdue-days">{d.days_overdue} days</span></td>
                                        <td>
                                            <span className={`risk-badge ${getRiskClass(d.risk_level || d.risk_tier)}`}>
                                                {(d.risk_level || d.risk_tier || 'UNKNOWN').toUpperCase()}
                                            </span>
                                        </td>
                                        <td>
                                            <button
                                                className="btn-record-pickup"
                                                onClick={() => setPickupPatient({
                                                    patient_id: d.patient_id,
                                                })}
                                            >
                                                <Pill size={15} /> Record Pickup
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {pickupPatient && (
                <PickupForm
                    isOpen={true}
                    preselectedPatient={pickupPatient}
                    currentUser={currentUser}
                    onClose={() => setPickupPatient(null)}
                    onSuccess={() => {
                        setPickupPatient(null);
                        showToast({ type: 'success', message: 'Pickup recorded! Patient returned to active list.' });
                        loadDefaulters();
                    }}
                />
            )}
        </div>
    );
}

export default Defaulters;