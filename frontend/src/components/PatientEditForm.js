import React, { useState } from 'react';
import { User, MapPin, Heart, X, Save } from 'lucide-react';
import './PatientForm.css';
import { patientsAPI } from '../services/api';
import { useNotifications } from '../contexts/NotificationContext';

/**
 * PatientEditForm.js — Edit an existing patient using the arv_inference schema.
 * No first_name/last_name — patient identified by patient_id.
 */
function PatientEditForm({ patient, onClose, onSuccess }) {
    const { showToast, addNotification } = useNotifications();

    const [formData, setFormData] = useState({
        sex:                           patient.sex || '',
        date_of_birth:                 patient.date_of_birth ? patient.date_of_birth.split('T')[0] : '',
        art_start_date:                patient.art_start_date ? patient.art_start_date.split('T')[0] : '',
        hiv_diagnosis_date:            patient.hiv_diagnosis_date ? patient.hiv_diagnosis_date.split('T')[0] : '',
        who_stage_at_enrolment:        patient.who_stage_at_enrolment || '',
        baseline_cd4:                  patient.baseline_cd4 || '',
        residence_province:            patient.residence_province || '',
        residence_district:            patient.residence_district || '',
        residence_village:             patient.residence_village || '',
        residence_ward:                patient.residence_ward || '',
        residence_gps_lat:             patient.residence_gps_lat || '',
        residence_gps_lon:             patient.residence_gps_lon || '',
        self_reported_travel_time_min: patient.self_reported_travel_time_min || '',
        phone_available:               patient.phone_available || '',
        marital_status:                patient.marital_status || '',
        education_level:               patient.education_level || '',
        occupation:                    patient.occupation || '',
        disclosure_status:             patient.disclosure_status || '',
    });

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(false);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const response = await patientsAPI.updatePatient(patient.patient_id, formData);
            setSuccess(true);

            showToast({ type: 'success', message: `Patient ${patient.patient_id} updated successfully`, duration: 5000 });
            addNotification({
                type: 'patient', title: 'Patient Updated',
                message: `${patient.patient_id} profile updated`,
                showToast: false
            });

            setTimeout(() => {
                if (onSuccess) onSuccess(response);
                if (onClose) onClose();
            }, 1800);

        } catch (err) {
            const msg = err.response?.data?.message || err.message || 'Failed to update patient.';
            setError(msg);
            setLoading(false);
            showToast({ type: 'error', message: msg, duration: 5000 });
        }
    };

    if (success) {
        return (
            <div className="form-overlay">
                <div className="form-modal success-modal">
                    <div className="success-icon">✅</div>
                    <h2>Patient Updated!</h2>
                    <p>{patient.patient_id} has been updated successfully.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="form-overlay" onClick={onClose}>
            <div className="form-modal" onClick={e => e.stopPropagation()}>
                <div className="form-header">
                    <h2>Edit Patient — {patient.patient_id}</h2>
                    <button className="close-button" onClick={onClose}><X size={18} /></button>
                </div>

                {error && (
                    <div className="form-error">⚠ {error}</div>
                )}

                <form className="patient-form" onSubmit={handleSubmit}>

                    {/* Demographics */}
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
                                <input type="date" name="date_of_birth" value={formData.date_of_birth} onChange={handleChange} min="1946-01-01" max="2018-12-31" />
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

                    {/* Clinical */}
                    <div className="form-section">
                        <h3 className="section-title"><Heart size={16} /> Clinical Information</h3>
                        <div className="form-row">
                            <div className="form-group">
                                <label>ART Start Date</label>
                                <input type="date" name="art_start_date" value={formData.art_start_date} onChange={handleChange} />
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
                                <input type="number" name="baseline_cd4" value={formData.baseline_cd4} onChange={handleChange} placeholder="e.g. 350" />
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

                    {/* Residence */}
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
                                <input type="number" name="residence_ward" value={formData.residence_ward} onChange={handleChange} placeholder="1-34" />
                            </div>
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label>GPS Latitude</label>
                                <input type="number" step="any" name="residence_gps_lat" value={formData.residence_gps_lat} onChange={handleChange} placeholder="-18.97" />
                            </div>
                            <div className="form-group">
                                <label>GPS Longitude</label>
                                <input type="number" step="any" name="residence_gps_lon" value={formData.residence_gps_lon} onChange={handleChange} placeholder="32.67" />
                            </div>
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label>Travel Time to Clinic (minutes)</label>
                                <input type="number" name="self_reported_travel_time_min" value={formData.self_reported_travel_time_min} onChange={handleChange} placeholder="e.g. 45" />
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="form-actions">
                        <button type="button" className="cancel-button" onClick={onClose} disabled={loading}>Cancel</button>
                        <button type="submit" className="submit-button" disabled={loading}>
                            {loading
                                ? <><span className="spinner-small"></span>Updating...</>
                                : <><Save size={15} /> Save Changes</>}
                        </button>
                    </div>

                </form>
            </div>
        </div>
    );
}

export default PatientEditForm;