import React, { useState, useEffect } from 'react';
import { User, MapPin, Heart, Phone, X, UserPlus } from 'lucide-react';
import './PatientForm.css';
import { patientsAPI, facilitiesAPI } from '../services/api';
import { useNotifications } from '../contexts/NotificationContext';

function PatientForm({ onClose, onSuccess, currentUser }) {
    const { showToast, addNotification } = useNotifications();

    const [loading, setLoading]       = useState(false);
    const [success, setSuccess]       = useState(false);
    const [error, setError]           = useState(null);
    const [facilities, setFacilities] = useState([]);

    const [formData, setFormData] = useState({
        patient_id:                    '',
        first_name:                    '',
        last_name:                     '',
        facility_id:                   '',
        sex:                           '',
        date_of_birth:                 '',
        art_start_date:                '',
        hiv_diagnosis_date:            '',
        who_stage_at_enrolment:        '',
        baseline_cd4:                  '',
        residence_province:            '',
        residence_district:            '',
        residence_village:             '',
        residence_ward:                '',
        self_reported_travel_time_min: '',
        phone_available:               '',
        phone_number:                  '',
        next_of_kin_name:              '',
        next_of_kin_phone:             '',
        marital_status:                '',
        education_level:               '',
        occupation:                    '',
        disclosure_status:             '',
    });

    // Load facilities for dropdown — GPS is fetched silently by backend on submit
    useEffect(() => {
        const load = async () => {
            try {
                const res = await facilitiesAPI.getAll();
                setFacilities(res.facilities || res.data || []);
            } catch (e) {
                console.error('Could not load facilities:', e);
            }
        };
        load();
    }, []);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);

        if (!formData.art_start_date) {
            setError('ART Start Date is required.');
            return;
        }
        if (!formData.facility_id) {
            setError('Facility is required.');
            return;
        }

        setLoading(true);
        try {
            const payload = {};
            Object.entries(formData).forEach(([k, v]) => {
                payload[k] = v === '' ? null : v;
            });
            // GPS lat/lon NOT sent from frontend — backend auto-fills from facility record

            await patientsAPI.createPatient(payload);

            setSuccess(true);
            showToast({ type: 'success', message: '✅ Patient registered successfully!' });
            addNotification({
                type: 'patient',
                title: 'New Patient Registered',
                message: `Patient ${formData.patient_id || '(auto-ID)'} added`,
                showToast: false,
            });

            setTimeout(() => {
                if (onSuccess) onSuccess();
                if (onClose)   onClose();
            }, 1800);
        } catch (err) {
            const msg = err.response?.data?.message || err.message || 'Failed to register patient.';
            setError(msg);
            showToast({ type: 'error', message: msg });
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <div className="form-overlay">
                <div className="form-modal success-modal">
                    <div className="success-icon">✅</div>
                    <h2>Patient Registered!</h2>
                    <p>The new patient has been added successfully.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="form-overlay" onClick={onClose}>
            <div className="form-modal" onClick={e => e.stopPropagation()}>

                <div className="form-header">
                    <h2><UserPlus size={18} /> New Patient</h2>
                    <button className="close-button" onClick={onClose}><X size={18} /></button>
                </div>

                {error && <div className="form-error">⚠ {error}</div>}

                <form className="patient-form" onSubmit={handleSubmit}>

                    {/* ── IDENTIFICATION ── */}
                    <div className="form-section">
                        <h3 className="section-title"><User size={16} /> Identification</h3>
                        <div className="form-row">
                            <div className="form-group">
                                <label>First Name</label>
                                <input name="first_name" value={formData.first_name} onChange={handleChange} placeholder="e.g. Obriel" />
                            </div>
                            <div className="form-group">
                                <label>Last Name</label>
                                <input name="last_name" value={formData.last_name} onChange={handleChange} placeholder="e.g. Moyo" />
                            </div>
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label>Patient ID <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>(leave blank to auto-generate)</span></label>
                                <input name="patient_id" value={formData.patient_id} onChange={handleChange} placeholder="e.g. PT000100" />
                            </div>
                            <div className="form-group">
                                <label>Facility <span style={{ color: '#ef4444' }}>*</span></label>
                                <select name="facility_id" value={formData.facility_id} onChange={handleChange} required>
                                    <option value="">Select facility...</option>
                                    {facilities.map(f => (
                                        <option key={f.facility_id} value={f.facility_id}>
                                            {f.facility_name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* ── DEMOGRAPHICS ── */}
                    <div className="form-section">
                        <h3 className="section-title"><User size={16} /> Demographics</h3>
                        <div className="form-row">
                            <div className="form-group">
                                <label>Sex</label>
                                <select name="sex" value={formData.sex} onChange={handleChange}>
                                    <option value="">Select...</option>
                                    <option value="F">Female</option>
                                    <option value="M">Male</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Date of Birth</label>
                                <input type="date" name="date_of_birth" value={formData.date_of_birth} onChange={handleChange} />
                            </div>
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label>Marital Status</label>
                                <select name="marital_status" value={formData.marital_status} onChange={handleChange}>
                                    <option value="">Select...</option>
                                    <option value="single">Single</option>
                                    <option value="married">Married</option>
                                    <option value="widowed">Widowed</option>
                                    <option value="divorced">Divorced</option>
                                    <option value="cohabiting">Cohabiting</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Education Level</label>
                                <select name="education_level" value={formData.education_level} onChange={handleChange}>
                                    <option value="">Select...</option>
                                    <option value="none">None</option>
                                    <option value="primary">Primary</option>
                                    <option value="secondary">Secondary</option>
                                    <option value="tertiary">Tertiary</option>
                                </select>
                            </div>
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label>Occupation</label>
                                <select name="occupation" value={formData.occupation} onChange={handleChange}>
                                    <option value="">Select...</option>
                                    <option value="farmer">Farmer</option>
                                    <option value="informal_trader">Informal Trader</option>
                                    <option value="formal_employed">Formal Employed</option>
                                    <option value="unemployed">Unemployed</option>
                                    <option value="student">Student</option>
                                    <option value="domestic">Domestic</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Phone Available</label>
                                <select name="phone_available" value={formData.phone_available} onChange={handleChange}>
                                    <option value="">Select...</option>
                                    <option value="Yes">Yes</option>
                                    <option value="No">No</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* ── CLINICAL ── */}
                    <div className="form-section">
                        <h3 className="section-title"><Heart size={16} /> Clinical Information</h3>
                        <div className="form-row">
                            <div className="form-group">
                                <label>ART Start Date <span style={{ color: '#ef4444' }}>*</span></label>
                                <input type="date" name="art_start_date" value={formData.art_start_date} onChange={handleChange} required />
                            </div>
                            <div className="form-group">
                                <label>HIV Diagnosis Date</label>
                                <input type="date" name="hiv_diagnosis_date" value={formData.hiv_diagnosis_date} onChange={handleChange} />
                            </div>
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label>WHO Stage at Enrolment</label>
                                <select name="who_stage_at_enrolment" value={formData.who_stage_at_enrolment} onChange={handleChange}>
                                    <option value="">Select...</option>
                                    <option value="1">Stage 1 — Asymptomatic</option>
                                    <option value="2">Stage 2 — Mild Symptoms</option>
                                    <option value="3">Stage 3 — Advanced</option>
                                    <option value="4">Stage 4 — Severe / AIDS</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Baseline CD4 (copies/mL)</label>
                                <input type="number" name="baseline_cd4" value={formData.baseline_cd4} onChange={handleChange} placeholder="e.g. 350" min="0" />
                            </div>
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label>Disclosure Status</label>
                                <select name="disclosure_status" value={formData.disclosure_status} onChange={handleChange}>
                                    <option value="">Select...</option>
                                    <option value="disclosed">Disclosed</option>
                                    <option value="not_disclosed">Not Disclosed</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* ── RESIDENCE ── */}
                    <div className="form-section">
                        <h3 className="section-title"><MapPin size={16} /> Residence & Access</h3>
                        <div className="form-row">
                            <div className="form-group">
                                <label>Province</label>
                                <input name="residence_province" value={formData.residence_province} onChange={handleChange} placeholder="e.g. Manicaland" />
                            </div>
                            <div className="form-group">
                                <label>District</label>
                                <input name="residence_district" value={formData.residence_district} onChange={handleChange} placeholder="e.g. Mutare" />
                            </div>
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label>Village</label>
                                <input name="residence_village" value={formData.residence_village} onChange={handleChange} />
                            </div>
                            <div className="form-group">
                                <label>Ward</label>
                                <input type="number" name="residence_ward" value={formData.residence_ward} onChange={handleChange} placeholder="1–34" min="1" />
                            </div>
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label>Travel Time to Clinic (minutes)</label>
                                <input type="number" name="self_reported_travel_time_min" value={formData.self_reported_travel_time_min} onChange={handleChange} placeholder="e.g. 45" min="0" />
                            </div>
                        </div>
                    </div>

                    {/* ── CONTACT ── */}
                    <div className="form-section">
                        <h3 className="section-title"><Phone size={16} /> Contact & Next of Kin</h3>
                        <div className="form-row">
                            <div className="form-group">
                                <label>Patient Phone Number</label>
                                <input name="phone_number" value={formData.phone_number} onChange={handleChange} placeholder="+263771234567" />
                            </div>
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label>Next of Kin Name</label>
                                <input name="next_of_kin_name" value={formData.next_of_kin_name} onChange={handleChange} placeholder="Full name" />
                            </div>
                            <div className="form-group">
                                <label>Next of Kin Phone</label>
                                <input name="next_of_kin_phone" value={formData.next_of_kin_phone} onChange={handleChange} placeholder="+263771234567" />
                            </div>
                        </div>
                    </div>

                    {/* ── ACTIONS ── */}
                    <div className="form-actions">
                        <button type="button" className="cancel-button" onClick={onClose} disabled={loading}>Cancel</button>
                        <button type="submit" className="submit-button" disabled={loading}>
                            {loading
                                ? <><span className="spinner-small"></span>Registering...</>
                                : <><UserPlus size={15} /> Register Patient</>}
                        </button>
                    </div>

                </form>
            </div>
        </div>
    );
}

export default PatientForm;