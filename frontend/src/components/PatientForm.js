import React, { useState, useEffect } from 'react';
import { X, Save, Loader2 } from 'lucide-react';
import { patientsAPI, facilitiesAPI } from '../services/api';
import { useNotifications } from '../contexts/NotificationContext';

/**
 * PatientForm.js — Register a new patient using the arv_inference schema.
 * Fields map exactly to the patients table columns.
 */
function PatientForm({ onClose, onSuccess, currentUser }) {
    const { showToast } = useNotifications();
    const [saving, setSaving] = useState(false);
    const [facilities, setFacilities] = useState([]);

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
        // Load facilities for dropdown
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
            showToast({ type: 'success', message: 'Patient registered successfully!' });
            onSuccess?.();
            onClose();
        } catch (err) {
            showToast({ type: 'error', message: err.message || 'Failed to register patient' });
        } finally {
            setSaving(false);
        }
    };

    const inputClass = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
    const labelClass = "block text-sm font-medium text-gray-700 mb-1";
    const sectionClass = "mb-6";

    return (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
            <div className="modal-content" style={{ background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '700px', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

                {/* Header */}
                <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700 }}>Register New Patient</h2>
                        <p style={{ margin: 0, fontSize: '0.8rem', color: '#6b7280' }}>All fields with * are required</p>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} style={{ overflowY: 'auto', padding: '1.5rem', flex: 1 }}>

                    {/* Section: Identification */}
                    <div className={sectionClass}>
                        <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#374151', marginBottom: '1rem', paddingBottom: '0.5rem', borderBottom: '1px solid #f3f4f6' }}>Patient Identification</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div>
                                <label className={labelClass}>Patient ID (auto-generated if blank)</label>
                                <input name="patient_id" value={form.patient_id} onChange={handleChange} placeholder="e.g. PT000100" className={inputClass} />
                            </div>
                            <div>
                                <label className={labelClass}>Facility *</label>
                                <select name="facility_id" value={form.facility_id} onChange={handleChange} required className={inputClass}>
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

                    {/* Section: Demographics */}
                    <div className={sectionClass}>
                        <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#374151', marginBottom: '1rem', paddingBottom: '0.5rem', borderBottom: '1px solid #f3f4f6' }}>Demographics</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div>
                                <label className={labelClass}>Sex</label>
                                <select name="sex" value={form.sex} onChange={handleChange} className={inputClass}>
                                    <option value="">Select...</option>
                                    <option value="F">Female</option>
                                    <option value="M">Male</option>
                                </select>
                            </div>
                            <div>
                                <label className={labelClass}>Date of Birth</label>
                                <input type="date" name="date_of_birth" value={form.date_of_birth} onChange={handleChange} className={inputClass} />
                            </div>
                            <div>
                                <label className={labelClass}>Marital Status</label>
                                <select name="marital_status" value={form.marital_status} onChange={handleChange} className={inputClass}>
                                    <option value="">Select...</option>
                                    <option value="single">Single</option>
                                    <option value="married">Married</option>
                                    <option value="widowed">Widowed</option>
                                    <option value="divorced">Divorced</option>
                                    <option value="cohabiting">Cohabiting</option>
                                </select>
                            </div>
                            <div>
                                <label className={labelClass}>Education Level</label>
                                <select name="education_level" value={form.education_level} onChange={handleChange} className={inputClass}>
                                    <option value="">Select...</option>
                                    <option value="none">None</option>
                                    <option value="primary">Primary</option>
                                    <option value="secondary">Secondary</option>
                                    <option value="tertiary">Tertiary</option>
                                </select>
                            </div>
                            <div>
                                <label className={labelClass}>Occupation</label>
                                <select name="occupation" value={form.occupation} onChange={handleChange} className={inputClass}>
                                    <option value="">Select...</option>
                                    <option value="farmer">Farmer</option>
                                    <option value="informal_trader">Informal Trader</option>
                                    <option value="formal_employed">Formal Employed</option>
                                    <option value="unemployed">Unemployed</option>
                                    <option value="student">Student</option>
                                    <option value="domestic">Domestic</option>
                                </select>
                            </div>
                            <div>
                                <label className={labelClass}>Phone Available</label>
                                <select name="phone_available" value={form.phone_available} onChange={handleChange} className={inputClass}>
                                    <option value="">Select...</option>
                                    <option value="Yes">Yes</option>
                                    <option value="No">No</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Section: Clinical */}
                    <div className={sectionClass}>
                        <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#374151', marginBottom: '1rem', paddingBottom: '0.5rem', borderBottom: '1px solid #f3f4f6' }}>Clinical Information</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div>
                                <label className={labelClass}>ART Start Date *</label>
                                <input type="date" name="art_start_date" value={form.art_start_date} onChange={handleChange} required className={inputClass} />
                            </div>
                            <div>
                                <label className={labelClass}>HIV Diagnosis Date</label>
                                <input type="date" name="hiv_diagnosis_date" value={form.hiv_diagnosis_date} onChange={handleChange} className={inputClass} />
                            </div>
                            <div>
                                <label className={labelClass}>WHO Stage at Enrolment</label>
                                <select name="who_stage_at_enrolment" value={form.who_stage_at_enrolment} onChange={handleChange} className={inputClass}>
                                    <option value="">Select...</option>
                                    <option value="1">Stage 1</option>
                                    <option value="2">Stage 2</option>
                                    <option value="3">Stage 3</option>
                                    <option value="4">Stage 4</option>
                                </select>
                            </div>
                            <div>
                                <label className={labelClass}>Baseline CD4</label>
                                <input type="number" name="baseline_cd4" value={form.baseline_cd4} onChange={handleChange} placeholder="copies/mL" className={inputClass} />
                            </div>
                            <div>
                                <label className={labelClass}>Disclosure Status</label>
                                <select name="disclosure_status" value={form.disclosure_status} onChange={handleChange} className={inputClass}>
                                    <option value="">Select...</option>
                                    <option value="disclosed">Disclosed</option>
                                    <option value="not_disclosed">Not Disclosed</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Section: Residence */}
                    <div className={sectionClass}>
                        <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#374151', marginBottom: '1rem', paddingBottom: '0.5rem', borderBottom: '1px solid #f3f4f6' }}>Residence & Access</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div>
                                <label className={labelClass}>Province</label>
                                <input name="residence_province" value={form.residence_province} onChange={handleChange} placeholder="e.g. Manicaland" className={inputClass} />
                            </div>
                            <div>
                                <label className={labelClass}>District</label>
                                <input name="residence_district" value={form.residence_district} onChange={handleChange} placeholder="e.g. Mutare" className={inputClass} />
                            </div>
                            <div>
                                <label className={labelClass}>Village</label>
                                <input name="residence_village" value={form.residence_village} onChange={handleChange} className={inputClass} />
                            </div>
                            <div>
                                <label className={labelClass}>Ward</label>
                                <input type="number" name="residence_ward" value={form.residence_ward} onChange={handleChange} placeholder="1-34" className={inputClass} />
                            </div>
                            <div>
                                <label className={labelClass}>GPS Latitude</label>
                                <input type="number" step="any" name="residence_gps_lat" value={form.residence_gps_lat} onChange={handleChange} placeholder="-18.97" className={inputClass} />
                            </div>
                            <div>
                                <label className={labelClass}>GPS Longitude</label>
                                <input type="number" step="any" name="residence_gps_lon" value={form.residence_gps_lon} onChange={handleChange} placeholder="32.67" className={inputClass} />
                            </div>
                            <div>
                                <label className={labelClass}>Travel Time to Clinic (minutes)</label>
                                <input type="number" name="self_reported_travel_time_min" value={form.self_reported_travel_time_min} onChange={handleChange} placeholder="e.g. 45" className={inputClass} />
                            </div>
                        </div>
                    </div>

                </form>

                {/* Footer */}
                <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                    <button type="button" onClick={onClose} style={{ padding: '0.5rem 1.25rem', border: '1px solid #d1d5db', borderRadius: '8px', background: '#fff', cursor: 'pointer', fontSize: '0.875rem' }}>
                        Cancel
                    </button>
                    <button onClick={handleSubmit} disabled={saving} style={{ padding: '0.5rem 1.25rem', border: 'none', borderRadius: '8px', background: '#3b82f6', color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {saving ? <Loader2 size={15} className="spin" /> : <Save size={15} />}
                        {saving ? 'Registering...' : 'Register Patient'}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default PatientForm;