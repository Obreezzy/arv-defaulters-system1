import React, { useState, useEffect } from 'react';
import { X, Save, Loader2, User, MapPin, Heart, Building2 } from 'lucide-react';
import './PatientForm.css';
import { patientsAPI, facilitiesAPI } from '../services/api';
import { useNotifications } from '../contexts/NotificationContext';

/**
 * PatientForm.js — Register a new patient using the arv_inference schema.
 * Uses PatientForm.css for all styling.
 */
function PatientForm({ onClose, onSuccess, currentUser }) {
    const { showToast } = useNotifications();
    const [saving, setSaving] = useState(false);
    const [facilities, setFacilities] = useState([]);
    const [success, setSuccess] = useState(false);

    const [form, setForm] = useState({
        patient_id:                    '',
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
        residence_gps_lat:             '',
        residence_gps_lon:             '',
        self_reported_travel_time_min: '',
        phone_available:               '',
        marital_status:                '',
        education_level:               '',
        occupation:                    '',
        disclosure_status:             '',
    });

    useEffect(() => {
        const loadFacilities = async () => {
            try {
                const res = await facilitiesAPI.getAll();
                setFacilities(res.facilities || res.data || []);
            } catch (e) {
                console.error('Failed to load facilities:', e);
            }
        };
        loadFacilities();
    }, []);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setForm(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.art_start_date) {
            showToast({ type: 'error', message: 'ART Start Date is required' });
            return;
        }
        if (!form.facility_id) {
            showToast({ type: 'error', message: 'Facility is required' });
            return;
        }

        setSaving(true);
        try {
            await patientsAPI.createPatient(form);
            setSuccess(true);
            showToast({ type: 'success', message: 'Patient registered successfully!' });
            setTimeout(() => {
                onSuccess?.();
                onClose();
            }, 1800);
        } catch (err) {
            const msg = err.response?.data?.message || err.message || 'Failed to register patient';
            showToast({ type: 'error', message: msg });
        } finally {
            setSaving(false);
        }
    };

    if (success) {
        return (
            <div className="form-overlay">
                <div className="form-modal success-modal">
                    <div className="success-icon">✅</div>
                    <h2>Patient Registered!</h2>
                    <p>The new patient has been added to the system.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="form-overlay" onClick={onClose}>
            <div className="form-modal" onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className="form-header">
                    <h2>Register New Patient</h2>
                    <button className="close-button" onClick={onClose}><X size={18} /></button>
                </div>

                <form className="patient-form" onSubmit={handleSubmit}>

                    {/* Patient Identification */}
                    <div className="form-section">
                        <h3 className="section-title"><Building2 size={16} /> Patient Identification</h3>
                        <div className="form-row">
                            <div className="form-group">
                                <label>Patient ID (auto-generated if blank)</label>
                                <input name="patient_id" value={form.patient_id} onChange={handleChange} placeholder="e.g. PT000100" />
                            </div>
                            <div className="form-group">
                                <label>Facility <span className="required">*</span></label>
                                <select name="facility_id" value={form.facility_id} onChange={handleChange} required>
                                    <option value="">Select facility...</option>
                                    {facilities.map(f => (
                                        <option key={f.facility_id} value={f.facility_id}>
                                            {f.facility_name} ({f.catchment_type})
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Demographics */}
                    <div className="form-section">
                        <h3 className="section-title"><User size={16} /> Demographics</h3>
                        <div className="form-row">
                            <div className="form-group">
                                <label>Sex</label>
                                <select name="sex" value={form.sex} onChange={handleChange}>
                                    <option value="">Select...</option>
                                    <option value="F">Female</option>
                                    <option value="M">Male</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Date of Birth</label>
                                <input type="date" name="date_of_birth" value={form.date_of_birth} onChange={handleChange} />
                            </div>
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label>Marital Status</label>
                                <select name="marital_status" value={form.marital_status} onChange={handleChange}>
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
                                <select name="education_level" value={form.education_level} onChange={handleChange}>
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
                                <select name="occupation" value={form.occupation} onChange={handleChange}>
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
                                <select name="phone_available" value={form.phone_available} onChange={handleChange}>
                                    <option value="">Select...</option>
                                    <option value="Yes">Yes</option>
                                    <option value="No">No</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Clinical Information */}
                    <div className="form-section">
                        <h3 className="section-title"><Heart size={16} /> Clinical Information</h3>
                        <div className="form-row">
                            <div className="form-group">
                                <label>ART Start Date <span className="required">*</span></label>
                                <input type="date" name="art_start_date" value={form.art_start_date} onChange={handleChange} required />
                            </div>
                            <div className="form-group">
                                <label>HIV Diagnosis Date</label>
                                <input type="date" name="hiv_diagnosis_date" value={form.hiv_diagnosis_date} onChange={handleChange} />
                            </div>
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label>WHO Stage at Enrolment</label>
                                <select name="who_stage_at_enrolment" value={form.who_stage_at_enrolment} onChange={handleChange}>
                                    <option value="">Select...</option>
                                    <option value="1">Stage 1</option>
                                    <option value="2">Stage 2</option>
                                    <option value="3">Stage 3</option>
                                    <option value="4">Stage 4</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Baseline CD4</label>
                                <input type="number" name="baseline_cd4" value={form.baseline_cd4} onChange={handleChange} placeholder="copies/mL" />
                            </div>
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label>Disclosure Status</label>
                                <select name="disclosure_status" value={form.disclosure_status} onChange={handleChange}>
                                    <option value="">Select...</option>
                                    <option value="disclosed">Disclosed</option>
                                    <option value="not_disclosed">Not Disclosed</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Residence & Access */}
                    <div className="form-section">
                        <h3 className="section-title"><MapPin size={16} /> Residence & Access</h3>
                        <div className="form-row">
                            <div className="form-group">
                                <label>Province</label>
                                <input name="residence_province" value={form.residence_province} onChange={handleChange} placeholder="e.g. Manicaland" />
                            </div>
                            <div className="form-group">
                                <label>District</label>
                                <input name="residence_district" value={form.residence_district} onChange={handleChange} placeholder="e.g. Mutare" />
                            </div>
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label>Village</label>
                                <input name="residence_village" value={form.residence_village} onChange={handleChange} />
                            </div>
                            <div className="form-group">
                                <label>Ward</label>
                                <input type="number" name="residence_ward" value={form.residence_ward} onChange={handleChange} placeholder="1-34" />
                            </div>
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label>GPS Latitude</label>
                                <input type="number" step="any" name="residence_gps_lat" value={form.residence_gps_lat} onChange={handleChange} placeholder="-18.97" />
                            </div>
                            <div className="form-group">
                                <label>GPS Longitude</label>
                                <input type="number" step="any" name="residence_gps_lon" value={form.residence_gps_lon} onChange={handleChange} placeholder="32.67" />
                            </div>
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label>Travel Time to Clinic (minutes)</label>
                                <input type="number" name="self_reported_travel_time_min" value={form.self_reported_travel_time_min} onChange={handleChange} placeholder="e.g. 45" />
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="form-actions">
                        <button type="button" className="cancel-button" onClick={onClose} disabled={saving}>
                            Cancel
                        </button>
                        <button type="submit" className="submit-button" disabled={saving}>
                            {saving ? <><span className="spinner-small"></span>Registering...</> : <><Save size={15} /> Register Patient</>}
                        </button>
                    </div>

                </form>
            </div>
        </div>
    );
}

export default PatientForm;