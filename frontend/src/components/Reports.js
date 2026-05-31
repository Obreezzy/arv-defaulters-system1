import React, { useState, useEffect } from 'react';
import { FileText, AlertTriangle, TrendingUp, Users, Download, FileSpreadsheet } from 'lucide-react';
import './Reports.css';
import { defaultersAPI, patientsAPI, pickupsAPI } from '../services/api'; 
import { useNotifications } from '../contexts/NotificationContext';
import LineChart from './charts/LineChart';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

function Reports() {
 const { showToast } = useNotifications();

 const [stats, setStats] = useState({
 totalPatients: 0, totalDefaulters: 0, highRisk: 0, adherenceRate: 0
 });

 const [patientsData, setPatientsData] = useState([]);
 const [defaultersData, setDefaultersData] = useState([]);
 const [loading, setLoading] = useState(true);

 // Report filters
 const [selectedPatient, setSelectedPatient] = useState('');
 const [patientSearch, setPatientSearch] = useState('');
 const [dateFrom, setDateFrom] = useState('');
 const [dateTo, setDateTo] = useState('');
 const [reportType, setReportType] = useState('summary');

 useEffect(() => { fetchReportData(); }, []);

 const fetchReportData = async () => {
 try {
 setLoading(true);
 const [pRes, dRes] = await Promise.all([
 patientsAPI.getAllPatients(),
 defaultersAPI.getAllDefaulters()
 ]);
 const patients = pRes.data || pRes.patients || [];
 const defaulters = dRes.defaulters || dRes.data || [];
 setPatientsData(patients);
 setDefaultersData(defaulters);

 // Total patients = only from patients table (no double counting with defaulters)
 const totalPatients = patients.length;
 const activePatients = patients.filter(p => p.exit_status === 'active' || p.is_active !== false).length;

 // High risk = only from ML risk_scores via patients query
 const highRisk = patients.filter(p => p.risk_level?.toLowerCase() === 'high').length;

 // Adherence = active non-defaulters / active total
 const adherenceRate = activePatients > 0
   ? Math.round(((activePatients - defaulters.length) / activePatients) * 100)
   : 0;

 setStats({
   totalPatients,
   totalDefaulters: defaulters.length,
   highRisk,
   adherenceRate: Math.max(0, adherenceRate),
 });
 setLoading(false);
 } catch (err) {
 showToast({ type: 'error', message: 'Failed to load report data' });
 setLoading(false);
 }
 };

 // Helpers 
 const fmtDate = (d) => {
 if (!d) return 'N/A';
 const dt = new Date(d);
 return `${String(dt.getDate()).padStart(2,'0')}-${String(dt.getMonth()+1).padStart(2,'0')}-${dt.getFullYear()}`;
 };

 const pdfHeader = (doc, title) => {
 doc.setFillColor(30, 64, 175);
 doc.rect(0, 0, 210, 38, 'F');
 doc.setTextColor(255,255,255);
 doc.setFontSize(18); doc.setFont('helvetica','bold');
 doc.text('ARV Defaulters Management System', 105, 16, { align: 'center' });
 doc.setFontSize(11); doc.setFont('helvetica','normal');
 doc.text(title, 105, 26, { align: 'center' });
 doc.text(`Generated: ${new Date().toLocaleString()}`, 105, 33, { align: 'center' });
 doc.setTextColor(0,0,0);
 };

 // 1. Summary Report 
 const generateSummaryPDF = () => {
 const doc = new jsPDF();
 pdfHeader(doc, 'Executive Summary Report');

 doc.setFontSize(13); doc.setFont('helvetica','bold');
 doc.text('1. System Overview', 14, 50);

 autoTable(doc, {
 startY: 55,
 body: [
 ['Total Registered Patients', stats.totalPatients],
 ['Active Defaulters', stats.totalDefaulters],
 ['High Risk Patients', stats.highRisk],
 ['Adherence Rate', `${stats.adherenceRate}%`],
 ['Report Period', dateFrom && dateTo ? `${fmtDate(dateFrom)} – ${fmtDate(dateTo)}` : 'All Time'],
 ],
 theme: 'striped',
 headStyles: { fillColor: [30,64,175] },
 styles: { fontSize: 10 },
 columnStyles: { 0: { fontStyle:'bold', cellWidth: 90 } }
 });

 const y1 = doc.lastAutoTable.finalY + 10;
 doc.setFontSize(13); doc.setFont('helvetica','bold');
 doc.text('2. Active Defaulters', 14, y1);

 autoTable(doc, {
 startY: y1 + 5,
 head: [['Patient ID', 'District', 'Days Overdue', 'Risk Level', 'Phone Available']],
 body: defaultersData.length > 0
 ? defaultersData.map(d => [
 d.patient_id || 'N/A',
 d.residence_district || 'N/A',
 `${d.days_overdue || 0} days`,
 d.risk_level?.toUpperCase() || 'N/A',
 d.phone_available || 'N/A'
 ])
 : [['No active defaulters','','','','']],
 headStyles: { fillColor: [239,68,68] },
 alternateRowStyles: { fillColor: [254,242,242] },
 styles: { fontSize: 9 }
 });

 doc.save('ARV_Summary_Report.pdf');
 showToast({ type: 'success', message: 'Summary PDF generated!' });
 };

 const generatePatientPDF = async () => {
 const patient = patientsData.find(p => p.patient_id === selectedPatient);
 if (!patient) { showToast({ type: 'error', message: 'Please select a patient first' }); return; }

 setLoading(true);
 showToast({ type: 'info', message: 'Gathering patient history...' });

 let history = [];
 try {
 const res = await pickupsAPI.getPatientPickups(patient.patient_id);
 history = res.pickups || res.data || [];
 } catch (err) {
 console.error("Failed to fetch history", err);
 }

 const doc = new jsPDF();
 pdfHeader(doc, `Patient Report: ${patient.patient_id}`);

 const isDefaulter = defaultersData.find(d => d.patient_id === patient.patient_id);
 let startY = 50;

 if (isDefaulter) {
 doc.setFontSize(12); doc.setFont('helvetica','bold');
 doc.setTextColor(239,68,68);
 doc.text(`URGENT: Patient is currently a defaulter (${isDefaulter.days_overdue} days overdue)`, 14, startY);
 doc.setTextColor(0,0,0);
 startY += 10;
 }

 doc.setFontSize(13); doc.setFont('helvetica','bold');
 doc.text('Patient Profile', 14, startY);

 const age = patient.date_of_birth
   ? Math.floor((new Date() - new Date(patient.date_of_birth)) / (365.25 * 24 * 60 * 60 * 1000))
   : 'N/A';

 autoTable(doc, {
 startY: startY + 5,
 body: [
 ['Patient ID', patient.patient_id],
 ['Sex', patient.sex === 'F' ? 'Female' : patient.sex === 'M' ? 'Male' : 'N/A'],
 ['Age', age],
 ['Date of Birth', fmtDate(patient.date_of_birth)],
 ['Phone Number', patient.phone_number || 'N/A'],
 ['Phone Available', patient.phone_available || 'N/A'],
 ['Next of Kin', patient.next_of_kin_name || 'N/A'],
 ['Next of Kin Phone', patient.next_of_kin_phone || 'N/A'],
 ['District', patient.residence_district || 'N/A'],
 ['Province', patient.residence_province || 'N/A'],
 ['Village', patient.residence_village || 'N/A'],
 ['Ward', patient.residence_ward || 'N/A'],
 ['Travel Time to Clinic', patient.self_reported_travel_time_min ? `${patient.self_reported_travel_time_min} min` : 'N/A'],
 ['Distance from Facility', patient.distance_km != null ? `${patient.distance_km} km` : 'N/A'],
 ['ART Start Date', fmtDate(patient.art_start_date)],
 ['Regimen', patient.regimen || 'N/A'],
 ['WHO Stage', patient.who_stage_at_enrolment || 'N/A'],
 ['Baseline CD4', patient.baseline_cd4 || 'N/A'],
 ['Marital Status', patient.marital_status || 'N/A'],
 ['Education', patient.education_level || 'N/A'],
 ['Occupation', patient.occupation || 'N/A'],
 ['Disclosure Status', patient.disclosure_status || 'N/A'],
 ['Facility', patient.facility_name || 'N/A'],
 ['Catchment Type', patient.catchment_type || 'N/A'],
 ['ML Risk Level', patient.risk_level || 'Not scored'],
 ['ML Risk Score', patient.risk_score != null ? `${patient.risk_score}%` : 'Not scored'],
 ['Next Pickup', fmtDate(patient.next_pickup_date)],
 ],
 theme: 'striped',
 headStyles: { fillColor: [30,64,175] },
 styles: { fontSize: 10 },
 columnStyles: { 0: { fontStyle:'bold', cellWidth: 60 } }
 });

 // Recent Pickup History Section (AI section removed entirely) 
 const nextY = doc.lastAutoTable.finalY + 15;
 doc.setFontSize(13); doc.setFont('helvetica','bold');
 doc.text('Recent Pickup History', 14, nextY); // Clean title without emojis

 const historyBody = history.slice(0, 15).map((pickup, index) => {
 const actualDate = new Date(pickup.actual_pickup_date);
 const prevRecord = history[index + 1]; 
 const expectedDate = prevRecord ? new Date(prevRecord.next_pickup_date) : null;
 
 let status = 'On Time';
 if (expectedDate && actualDate > expectedDate) {
 const daysLate = Math.floor((actualDate - expectedDate) / (1000 * 60 * 60 * 24));
 status = `${daysLate} Days Late`; // Removed emojis
 } else if (!expectedDate) {
 status = 'First Record';
 }

 return [
 fmtDate(pickup.actual_pickup_date),
 expectedDate ? fmtDate(expectedDate) : 'N/A',
 status,
 pickup.quantity_dispensed || '30',
 pickup.notes || '-'
 ];
 });

 if (historyBody.length === 0) {
 historyBody.push(['No pickup history available for this patient.', '', '', '', '']);
 }

 autoTable(doc, {
 startY: nextY + 5,
 head: [['Actual Pickup', 'Expected Date', 'Status', 'Dispensed', 'Notes']],
 body: historyBody,
 headStyles: { fillColor: [59, 130, 246] }, 
 alternateRowStyles: { fillColor: [241, 245, 249] },
 styles: { fontSize: 9 },
 didParseCell: function(data) {
 if (data.section === 'body' && data.column.index === 2) {
 if (data.cell.raw.includes('Late')) {
 data.cell.styles.textColor = [220, 38, 38]; // Clean Red Text
 data.cell.styles.fontStyle = 'bold';
 } else if (data.cell.raw.includes('On Time')) {
 data.cell.styles.textColor = [22, 163, 74]; // Clean Green Text
 }
 }
 }
 });

 doc.save(`Patient_Report_${patient.patient_id}.pdf`);
 setLoading(false);
 showToast({ type: 'success', message: `Report for ${patient.patient_id} generated!` });
 };

 // 3. High Risk Report 
 const generateHighRiskPDF = () => {
 const doc = new jsPDF();
 pdfHeader(doc, 'High Risk Patients Report');

 const highRisk = patientsData.filter(p => p.risk_level === 'High' || p.risk_level === 'Medium');

 doc.setFontSize(13); doc.setFont('helvetica','bold');
 doc.text(`At-Risk Patients (${highRisk.length} total)`, 14, 50);

 autoTable(doc, {
 startY: 55,
 head: [['Patient ID', 'Risk', 'Score', 'Distance', 'Next Pickup', 'Phone Available']],
 body: highRisk.length > 0
 ? highRisk.map(p => [
 p.patient_id,
 p.risk_level?.toUpperCase() || 'N/A',
 p.risk_score != null ? `${p.risk_score}%` : '0%',
 p.distance_km != null ? `${p.distance_km}km` : 'N/A',
 fmtDate(p.next_pickup_date),
 p.phone_available || 'N/A'
 ])
 : [['No high/medium risk patients found','','','','','']],
 headStyles: { fillColor: [245,158,11] },
 alternateRowStyles: { fillColor: [255,251,235] },
 styles: { fontSize: 9 }
 });

 doc.save('High_Risk_Patients_Report.pdf');
 showToast({ type: 'success', message: 'High Risk report generated!' });
 };

 // 4. Defaulters Report 
 const generateDefaultersPDF = () => {
 const doc = new jsPDF();
 pdfHeader(doc, 'Defaulters Tracking Report');

 doc.setFontSize(13); doc.setFont('helvetica','bold');
 doc.text(`Active Defaulters: ${defaultersData.length}`, 14, 50);

 autoTable(doc, {
 startY: 55,
 head: [['Patient ID', 'District', 'Days Overdue', 'Risk', 'Phone Available', 'Detected']],
 body: defaultersData.length > 0
 ? defaultersData.map(d => [
 d.patient_id || 'N/A',
 d.residence_district || 'N/A',
 `${d.days_overdue || 0} days`,
 d.risk_level?.toUpperCase() || 'N/A',
 d.phone_available || 'N/A',
 fmtDate(d.detected_date)
 ])
 : [['No active defaulters','','','','','']],
 headStyles: { fillColor: [239,68,68] },
 alternateRowStyles: { fillColor: [254,242,242] },
 styles: { fontSize: 9 }
 });

 doc.save('Defaulters_Report.pdf');
 showToast({ type: 'success', message: 'Defaulters report generated!' });
 };

 // 5. Excel Export 
 const generateExcel = () => {
 const wb = XLSX.utils.book_new();

 // Patients sheet
 const pSheet = XLSX.utils.json_to_sheet(patientsData.map(p => ({
 'Patient ID': p.patient_id,
 'Sex': p.sex === 'F' ? 'Female' : p.sex === 'M' ? 'Male' : 'N/A',
 'Date of Birth': fmtDate(p.date_of_birth),
 'Age': p.age || 'N/A',
 'Phone Number': p.phone_number || 'N/A',
 'Phone Available': p.phone_available || 'N/A',
 'Next of Kin': p.next_of_kin_name || 'N/A',
 'Next of Kin Phone': p.next_of_kin_phone || 'N/A',
 'Province': p.residence_province || 'N/A',
 'District': p.residence_district || 'N/A',
 'Village': p.residence_village || 'N/A',
 'Ward': p.residence_ward || 'N/A',
 'Travel Time (min)': p.self_reported_travel_time_min || 'N/A',
 'Distance (km)': p.distance_km || 'N/A',
 'ART Start Date': fmtDate(p.art_start_date),
 'Regimen': p.regimen || 'N/A',
 'WHO Stage': p.who_stage_at_enrolment || 'N/A',
 'Baseline CD4': p.baseline_cd4 || 'N/A',
 'Marital Status': p.marital_status || 'N/A',
 'Education': p.education_level || 'N/A',
 'Occupation': p.occupation || 'N/A',
 'Disclosure': p.disclosure_status || 'N/A',
 'Facility': p.facility_name || 'N/A',
 'Catchment': p.catchment_type || 'N/A',
 'ML Risk Level': p.risk_level || 'Not scored',
 'ML Risk Score': p.risk_score != null ? `${p.risk_score}%` : 'Not scored',
 'Next Pickup': fmtDate(p.next_pickup_date),
 'Status': p.exit_status || 'N/A',
 })));
 XLSX.utils.book_append_sheet(wb, pSheet, 'Patients');

 // Defaulters sheet
 const dSheet = XLSX.utils.json_to_sheet(defaultersData.map(d => ({
 'Patient ID': d.patient_id,
 'District': d.residence_district || 'N/A',
 'Days Overdue': d.days_overdue,
 'Risk Level': d.risk_level,
 'Phone Available': d.phone_available || 'N/A',
 'Status': d.status,
 'Detected Date': fmtDate(d.detected_date),
 })));
 XLSX.utils.book_append_sheet(wb, dSheet, 'Defaulters');

 // Summary sheet
 const sSheet = XLSX.utils.json_to_sheet([
 { Metric: 'Total Patients', Value: stats.totalPatients },
 { Metric: 'Active Defaulters', Value: stats.totalDefaulters },
 { Metric: 'High Risk', Value: stats.highRisk },
 { Metric: 'Adherence Rate', Value: `${stats.adherenceRate}%` },
 { Metric: 'Report Date', Value: new Date().toLocaleDateString() },
 ]);
 XLSX.utils.book_append_sheet(wb, sSheet, 'Summary');

 XLSX.writeFile(wb, 'ARV_System_Data.xlsx');
 showToast({ type: 'success', message: 'Excel exported successfully!' });
 };

 const adherenceTrendData = {
 labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
 datasets: [{
 label: 'Adherence %',
 data: [85, 87, 84, 89, 91, stats.adherenceRate],
 borderColor: '#10b981',
 backgroundColor: 'rgba(16, 185, 129, 0.1)',
 fill: true, tension: 0.4
 }]
 };

 if (loading) return (
 <div className="loading-state">
 <div className="spinner"></div>
 <p>Processing data...</p>
 </div>
 );

 return (
 <div className="reports-page">
 <div className="reports-header">
 <h2 className="reports-title">System Reports &amp; Exports</h2>
 <div className="reports-date">As of {new Date().toLocaleDateString()}</div>
 </div>

 {/* Report Type Selector */}
 <div className="report-type-bar">
 {[
 { key: 'summary',    label: 'Summary',        desc: 'Full system overview',  icon: <FileText size={16} /> },
 { key: 'patient',    label: 'Patient Report', desc: 'Single patient detail', icon: <Users size={16} /> },
 { key: 'highrisk',   label: 'High Risk',      desc: 'At-risk patients',      icon: <AlertTriangle size={16} /> },
 { key: 'defaulters', label: 'Defaulters',     desc: 'Missed pickups',        icon: <TrendingUp size={16} /> },
 { key: 'excel',      label: 'Excel Export',   desc: 'Full data export',      icon: <FileSpreadsheet size={16} /> },
 ].map(r => (
 <button
 key={r.key}
 className={`report-type-btn ${reportType === r.key ? 'active' : ''}`}
 onClick={() => setReportType(r.key)}
 >
 <span className="rt-icon">{r.icon}</span>
 <span className="rt-label">{r.label}</span>
 <span className="rt-desc">{r.desc}</span>
 </button>
 ))}
 </div>

 {/* Filters */}
 <div className="report-filters">
 {reportType === 'patient' && (
 <div className="filter-group" style={{ position: 'relative', minWidth: '280px' }}>
 <label>Search Patient</label>
 <input
   type="text"
   placeholder="Type ID, name, or district..."
   value={patientSearch}
   onChange={e => { setPatientSearch(e.target.value); setSelectedPatient(''); }}
   style={{
     width: '100%', padding: '0.5rem 0.75rem',
     border: selectedPatient ? '2px solid #3b82f6' : '1px solid #d1d5db',
     borderRadius: '6px', fontSize: '0.875rem', boxSizing: 'border-box'
   }}
 />
 {patientSearch && !selectedPatient && (
   <div style={{
     position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
     background: 'white', border: '1px solid #e5e7eb', borderRadius: '6px',
     boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxHeight: '200px', overflowY: 'auto'
   }}>
     {patientsData
       .filter(p => {
         const s = patientSearch.toLowerCase();
         return (
           (p.patient_id || '').toLowerCase().includes(s) ||
           (p.first_name || '').toLowerCase().includes(s) ||
           (p.last_name || '').toLowerCase().includes(s) ||
           (`${p.first_name || ''} ${p.last_name || ''}`).toLowerCase().includes(s) ||
           (p.residence_district || '').toLowerCase().includes(s)
         );
       })
       .slice(0, 20)
       .map(p => (
         <div
           key={p.patient_id}
           onClick={() => { setSelectedPatient(p.patient_id); setPatientSearch(`${p.patient_id}${p.first_name ? ' — ' + p.first_name + ' ' + (p.last_name || '') : ''}${p.residence_district ? ' · ' + p.residence_district : ''}`); }}
           style={{
             padding: '0.5rem 0.75rem', cursor: 'pointer', fontSize: '0.85rem',
             borderBottom: '1px solid #f3f4f6'
           }}
           onMouseEnter={e => e.target.style.background = '#eff6ff'}
           onMouseLeave={e => e.target.style.background = 'white'}
         >
           <strong>{p.patient_id}</strong>
           {(p.first_name || p.last_name) && <span style={{ color: '#374151' }}> — {p.first_name} {p.last_name}</span>}
           {p.residence_district && <span style={{ color: '#6b7280' }}> · {p.residence_district}</span>}
         </div>
       ))
     }
     {patientsData.filter(p => {
       const s = patientSearch.toLowerCase();
       return (p.patient_id || '').toLowerCase().includes(s) ||
         (p.first_name || '').toLowerCase().includes(s) ||
         (p.last_name || '').toLowerCase().includes(s) ||
         (p.residence_district || '').toLowerCase().includes(s);
     }).length === 0 && (
       <div style={{ padding: '0.75rem', color: '#9ca3af', fontSize: '0.85rem' }}>
         No patients found
       </div>
     )}
   </div>
 )}
 {selectedPatient && (
   <small style={{ color: '#3b82f6', fontSize: '0.75rem' }}>
     ✓ Selected: {selectedPatient} &nbsp;
     <span style={{ cursor: 'pointer', textDecoration: 'underline' }}
       onClick={() => { setSelectedPatient(''); setPatientSearch(''); }}>
       Clear
     </span>
   </small>
 )}
 </div>
 )}
 <div className="filter-group">
 <label>From Date</label>
 <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
 </div>
 <div className="filter-group">
 <label>To Date</label>
 <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
 </div>
 </div>

 {/* Generate Button */}
 <div className="generate-section">
 <button
 className="btn-generate"
 onClick={() => {
 if (reportType === 'summary') generateSummaryPDF();
 else if (reportType === 'patient') generatePatientPDF();
 else if (reportType === 'highrisk') generateHighRiskPDF();
 else if (reportType === 'defaulters') generateDefaultersPDF();
 else if (reportType === 'excel') generateExcel();
 }}
 >
 {reportType === 'excel' ? <><Download size={16} /> Export Excel</> : <><FileText size={16} /> Generate PDF Report</>}
 </button>

 <div className="report-stats-row">
 <div className="mini-stat"><span>{stats.totalPatients}</span><small>Total Patients</small></div>
 <div className="mini-stat red"><span>{stats.totalDefaulters}</span><small>Defaulters</small></div>
 <div className="mini-stat orange"><span>{stats.highRisk}</span><small>High Risk</small></div>
 <div className="mini-stat green"><span>{stats.adherenceRate}%</span><small>Adherence</small></div>
 </div>
 </div>

 {/* Chart */}
 <div className="report-chart-box">
 <h3>Adherence Performance Trend</h3>
 <div className="chart-inner">
 <LineChart data={adherenceTrendData} />
 </div>
 </div>
 </div>
 );
}

export default Reports;