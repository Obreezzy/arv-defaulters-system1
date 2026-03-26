import React, { useState, useEffect } from 'react';
import './Defaulters.css';
import { defaultersAPI } from '../services/api';
import { useNotifications } from '../contexts/NotificationContext';
import ResolveModal from './ResolveModal';

function Defaulters() {
  const { showToast } = useNotifications();
  const [defaulters, setDefaulters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [resolvingDefaulter, setResolvingDefaulter] = useState(null);

  useEffect(() => {
    loadDefaulters();
  }, []);

  const loadDefaulters = async () => {
    try {
      setLoading(true);
      const res = await defaultersAPI.getAllDefaulters();
      const data = res.defaulters || res.data || [];
      setDefaulters(data);
    } catch (err) {
      console.error(err);
      showToast({ type: 'error', message: 'Failed to load defaulters list' });
    } finally {
      setLoading(false);
    }
  };

  const runSystemScan = async () => {
    try {
      setScanning(true);
      showToast({ type: 'info', message: '🔍 Scanning database for missed pickups...' });
      await defaultersAPI.runDetection();
      showToast({ type: 'success', message: 'Scan complete! List updated.' });
      await loadDefaulters();
    } catch (err) {
      console.error(err);
      showToast({ type: 'error', message: 'Failed to run detection scan' });
    } finally {
      setScanning(false);
    }
  };

  const getRiskClass = (level) => {
    switch(level?.toLowerCase()) {
      case 'high': return 'risk-high';
      case 'medium': return 'risk-medium';
      case 'low': return 'risk-low';
      default: return 'risk-default';
    }
  };

  const getStatusClass = (status) => {
    switch(status?.toLowerCase()) {
      case 'returned': return 'status-returned';
      case 'lost_to_followup': return 'status-lost';
      default: return 'status-pending';
    }
  };

  return (
    <div className="defaulters-page">
      <div className="page-header">
        <div className="header-content">
            <h2 className="page-title">Defaulters Tracking</h2>
            <p className="page-subtitle">Patients who have missed their scheduled medication pickups.</p>
        </div>
        <div className="header-actions">
            <button 
                className={`btn-scan ${scanning ? 'scanning' : ''}`}
                onClick={runSystemScan} 
                disabled={scanning}
            >
                <span className="icon">{scanning ? '⏳' : '🔍'}</span>
                {scanning ? 'Scanning...' : 'Run Detection Scan'}
            </button>
        </div>
      </div>

      <div className="table-container">
        {defaulters.length === 0 && !loading ? (
            <div className="empty-state">
                <div className="empty-icon">🎉</div>
                <h3>No Defaulters Found</h3>
                <p>All patients are currently up to date with their medication pickups.</p>
            </div>
        ) : (
            <table className="defaulters-table">
                <thead>
                    <tr>
                        <th>Patient Name</th>
                        <th>Phone</th>
                        <th>Days Overdue</th>
                        <th>Risk Level</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {defaulters.map(d => (
                        <tr key={d.defaulter_id || Math.random()}>
                            <td className="fw-bold">
                                {d.patient_name || `${d.first_name} ${d.last_name}`}
                                <div className="sub-text">{d.patient_number}</div>
                            </td>
                            <td>{d.phone_number || 'N/A'}</td>
                            <td><span className="overdue-days">{d.days_overdue} days</span></td>
                            <td>
                                <span className={`risk-badge ${getRiskClass(d.risk_level)}`}>
                                    {d.risk_level?.toUpperCase() || 'UNKNOWN'}
                                </span>
                            </td>
                            <td>
                                <span className={`status-badge ${getStatusClass(d.status)}`}>
                                    {d.status?.replace('_', ' ').toUpperCase() || 'PENDING'}
                                </span>
                            </td>
                            <td>
                                <div className="action-buttons">
                                    {d.status?.toLowerCase() === 'pending' || !d.status ? (
                                        <button 
                                            className="btn-icon resolve" 
                                            title="Resolve Case"
                                            onClick={() => setResolvingDefaulter(d)}
                                        >
                                            ✅ Resolve
                                        </button>
                                    ) : (
                                        <span className="resolved-text">Resolved</span>
                                    )}
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        )}
      </div>

      {resolvingDefaulter && (
          <ResolveModal 
              defaulter={resolvingDefaulter} 
              onClose={() => setResolvingDefaulter(null)} 
              onSuccess={() => {
                  setResolvingDefaulter(null);
                  loadDefaulters(); 
              }} 
          />
      )}
    </div>
  );
}

export default Defaulters;