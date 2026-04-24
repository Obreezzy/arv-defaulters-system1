import React, { useState, useEffect } from 'react';
import StatCard from './StatCard';
import PickupForm from './PickupForm';
import PatientForm from './PatientForm';
import './Dashboard.css';
import { defaultersAPI, patientsAPI } from '../services/api';
import { schedulerAPI } from '../services/api';
import { useNotifications } from '../contexts/NotificationContext';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title);

export const getActiveAlerts = () => {
  try { return JSON.parse(localStorage.getItem('weatherAlerts') || '[]'); }
  catch { return []; }
};

export const saveAlerts = (alerts) => {
  localStorage.setItem('weatherAlerts', JSON.stringify(alerts));
};

const ALERT_TYPES = [
  { value: 'floods',       label: '🌊 Floods',             riskBoost: 35 },
  { value: 'heavy_rain',   label: '🌧️ Heavy Rains',         riskBoost: 20 },
  { value: 'cyclone',      label: '🌀 Cyclone Warning',     riskBoost: 45 },
  { value: 'road_closure', label: '🚧 Road Closure',        riskBoost: 25 },
  { value: 'drought',      label: '☀️ Extreme Heat/Drought', riskBoost: 15 },
];

function WeatherAlertModal({ onClose, onSave }) {
  const [alertType, setAlertType]       = useState('floods');
  const [affectedArea, setAffectedArea] = useState('');
  const [description, setDescription]   = useState('');

  const handleSave = () => {
    if (!affectedArea.trim()) return;
    const type  = ALERT_TYPES.find(a => a.value === alertType);
    const alert = {
      id: Date.now(), type: alertType, label: type.label,
      riskBoost: type.riskBoost, affectedArea: affectedArea.trim(),
      description, createdAt: new Date().toISOString(),
    };
    saveAlerts([...getActiveAlerts(), alert]);
    onSave();
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="weather-modal" onClick={e => e.stopPropagation()}>
        <div className="weather-modal-header">
          <h3>⚠️ Set Weather / Disaster Alert</h3>
          <button onClick={onClose}>✕</button>
        </div>
        <div className="weather-modal-body">
          <div className="wm-group">
            <label>Alert Type</label>
            <select value={alertType} onChange={e => setAlertType(e.target.value)}>
              {ALERT_TYPES.map(a => (
                <option key={a.value} value={a.value}>{a.label} (+{a.riskBoost}% risk boost)</option>
              ))}
            </select>
          </div>
          <div className="wm-group">
            <label>Affected Area (Ward, Village, or District) <span style={{ color: '#ef4444' }}>*</span></label>
            <input type="text" placeholder="e.g. Ward 12, Chigodora Village, Mutasa District"
              value={affectedArea} onChange={e => setAffectedArea(e.target.value)} />
            <small>Patients in this area will have their risk score boosted automatically</small>
          </div>
          <div className="wm-group">
            <label>Description (Optional)</label>
            <textarea rows="2" placeholder="e.g. Heavy flooding reported along the river"
              value={description} onChange={e => setDescription(e.target.value)} />
          </div>
        </div>
        <div className="weather-modal-footer">
          <button className="wm-cancel" onClick={onClose}>Cancel</button>
          <button className="wm-save" onClick={handleSave} disabled={!affectedArea.trim()}>🚨 Activate Alert</button>
        </div>
      </div>
    </div>
  );
}

// ── currentUser is now received from App.js ──
function Dashboard({ onNavigate, currentUser }) {
  const { showToast } = useNotifications();

  const [stats, setStats] = useState({
    totalPatients: 0, activePatients: 0, activeDefaulters: 0,
    highRisk: 0, mediumRisk: 0, adherenceRate: 0,
  });

  const [loading, setLoading]                   = useState(true);
  const [sendingSMS, setSendingSMS]             = useState(false);
  const [showPickupForm, setShowPickupForm]     = useState(false);
  const [showPatientForm, setShowPatientForm]   = useState(false);
  const [showAlertModal, setShowAlertModal]     = useState(false);
  const [activeAlerts, setActiveAlerts]         = useState(getActiveAlerts());

  useEffect(() => { fetchDashboardData(); }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const [patientsRes, defaultersRes] = await Promise.all([
        patientsAPI.getAllPatients(),
        defaultersAPI.getAllDefaulters()
      ]);

      const patients  = patientsRes.patients  || patientsRes.data  || [];
      const defaulters = defaultersRes.defaulters || defaultersRes.data || [];
      const activePatients       = patients.filter(p => p.is_active !== false).length;
      const predictedHighRisk    = patients.filter(p => p.risk_level === 'High').length;
      const predictedMediumRisk  = patients.filter(p => p.risk_level === 'Medium').length;

      setStats({
        totalPatients: patients.length, activePatients,
        activeDefaulters: defaulters.length,
        highRisk: predictedHighRisk, mediumRisk: predictedMediumRisk,
        adherenceRate: patients.length > 0
          ? Math.round(((activePatients - defaulters.length) / activePatients) * 100)
          : 0
      });
      setLoading(false);
    } catch (err) {
      console.error('Error loading dashboard:', err);
      setLoading(false);
    }
  };

  const handleSendReminders = async () => {
    setSendingSMS(true);
    showToast({ type: 'info', message: '📱 Sending reminder SMS...' });
    try {
      await schedulerAPI.sendReminders(1);
      showToast({ type: 'success', message: '✅ Reminder SMS sent successfully!' });
    } catch (err) {
      showToast({ type: 'error', message: 'Failed to send SMS reminders' });
    } finally {
      setSendingSMS(false);
    }
  };

  const dismissAlert = (id) => {
    const updated = activeAlerts.filter(a => a.id !== id);
    saveAlerts(updated);
    setActiveAlerts(updated);
    showToast({ type: 'info', message: 'Alert dismissed.' });
  };

  const handleAlertSaved = () => {
    setActiveAlerts(getActiveAlerts());
    showToast({ type: 'success', message: '🚨 Weather alert activated! Affected patients risk scores updated.' });
  };

  const riskChartData = {
    labels: ['High Risk', 'Medium Risk', 'Low Risk'],
    datasets: [{ data: [stats.highRisk, stats.mediumRisk, Math.max(0, stats.totalPatients - (stats.highRisk + stats.mediumRisk))], backgroundColor: ['#ef4444', '#f59e0b', '#10b981'], borderWidth: 0 }]
  };

  const adherenceChartData = {
    labels: ['Adherent', 'Defaulting'],
    datasets: [{ data: [Math.max(0, stats.activePatients - stats.activeDefaulters), stats.activeDefaulters], backgroundColor: ['#10b981', '#ef4444'], borderWidth: 0 }]
  };

  return (
    <div className="dashboard">

      {activeAlerts.length > 0 && (
        <div className="weather-alerts-container">
          {activeAlerts.map(alert => (
            <div key={alert.id} className="weather-alert-banner">
              <div className="weather-alert-left">
                <span className="weather-alert-icon">{alert.label.split(' ')[0]}</span>
                <div className="weather-alert-text">
                  <strong>{alert.label} — {alert.affectedArea}</strong>
                  {alert.description && <span>{alert.description}</span>}
                  <small>Patients in {alert.affectedArea} have +{alert.riskBoost}% risk boost applied</small>
                </div>
              </div>
              <button className="weather-alert-dismiss" onClick={() => dismissAlert(alert.id)}>✕</button>
            </div>
          ))}
        </div>
      )}

      <div className="stats-grid">
        <StatCard title="Total Patients"  value={stats.totalPatients}       icon="👥" color="#3b82f6" />
        <StatCard title="Adherence Rate"  value={`${stats.adherenceRate}%`} icon="📈" color="#10b981" />
        <StatCard title="Missed Pickups"  value={stats.activeDefaulters}    icon="⚠️" color="#ef4444" />
      </div>

      <div className="action-buttons-grid">
        <button className="dashboard-btn btn-register" onClick={() => setShowPatientForm(true)}>
          <span className="btn-icon">➕</span> Register Patient
        </button>
        <button className="dashboard-btn btn-pickup" onClick={() => setShowPickupForm(true)}>
          <span className="btn-icon">💊</span> Record Pickup
        </button>
        <button className="dashboard-btn btn-report" onClick={() => { if (onNavigate) onNavigate('reports'); }}>
          <span className="btn-icon">📄</span> Generate Report
        </button>
        <button className="dashboard-btn btn-sms" onClick={handleSendReminders} disabled={sendingSMS}>
          <span className="btn-icon">{sendingSMS ? '⏳' : '📱'}</span>
          {sendingSMS ? 'Sending...' : 'Send Reminders'}
        </button>
        <button className="dashboard-btn btn-alert" onClick={() => setShowAlertModal(true)}>
          <span className="btn-icon">🚨</span> Set Weather Alert
        </button>
      </div>

      <div className="ai-section">
        <h3 className="section-title">🔮 AI Risk Predictions</h3>
        <div className="ai-cards-container">
          <div className="ai-alert-card high-risk">
            <div className="alert-header"><span className="alert-icon">🔴</span><h4>High Risk Candidates</h4></div>
            <div className="alert-body"><span className="big-number red">{stats.highRisk}</span><p>Patients vulnerable due to distance, age, or history.</p></div>
            <button className="btn-action red" onClick={() => onNavigate ? onNavigate('patients', 'High') : null}>Review Patients</button>
          </div>
          <div className="ai-alert-card medium-risk">
            <div className="alert-header"><span className="alert-icon">🟠</span><h4>Medium Risk Candidates</h4></div>
            <div className="alert-body"><span className="big-number orange">{stats.mediumRisk}</span><p>Patients requiring monitoring to prevent default.</p></div>
            <button className="btn-action orange" onClick={() => onNavigate ? onNavigate('patients', 'Medium') : null}>Review Patients</button>
          </div>
          <div className="ai-alert-card system-ok">
            <div className="alert-header"><span className="alert-icon">🤖</span><h4>AI Engine Status</h4></div>
            <div className="alert-body">
              <span className="status-indicator online">ONLINE</span>
              <p>Predictive models active.{activeAlerts.length > 0 && <strong style={{ color: '#f97316' }}> {activeAlerts.length} weather alert(s) active.</strong>}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="charts-grid">
        <div className="chart-card">
          <h3>Predicted Risk Analysis</h3>
          <div className="chart-container">
            <Doughnut data={riskChartData} options={{ maintainAspectRatio: false, cutout: '70%' }} />
          </div>
        </div>
        <div className="chart-card">
          <h3>Adherence Overview</h3>
          <div className="chart-container">
            <Doughnut data={adherenceChartData} options={{ maintainAspectRatio: false, cutout: '70%' }} />
          </div>
        </div>
      </div>

      {/* ── currentUser forwarded to both forms ── */}
      {showPatientForm && (
        <PatientForm
          onClose={() => setShowPatientForm(false)}
          onSuccess={() => { fetchDashboardData(); setShowPatientForm(false); }}
          currentUser={currentUser}
        />
      )}
      {showPickupForm && (
        <PickupForm
          isOpen={true}
          onClose={() => setShowPickupForm(false)}
          onSuccess={() => { fetchDashboardData(); setShowPickupForm(false); showToast({ type: 'success', message: 'Pickup recorded!' }); }}
          currentUser={currentUser}
        />
      )}
      {showAlertModal && (
        <WeatherAlertModal onClose={() => setShowAlertModal(false)} onSave={handleAlertSaved} />
      )}
    </div>
  );
}

export default Dashboard;