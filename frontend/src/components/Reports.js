import React, { useState, useEffect } from 'react';
import './Reports.css';
import { defaultersAPI, patientsAPI } from '../services/api';
import { useNotifications } from '../contexts/NotificationContext';

// 👇 CORRECT IMPORTS FOR CHARTS
import LineChart from './charts/LineChart'; 

// 👇 CORRECT IMPORTS FOR PDF (The Fix)
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable'; // Import the function directly
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

function Reports() {
  const { showToast } = useNotifications();
  
  const [stats, setStats] = useState({
    totalPatients: 0,
    totalDefaulters: 0,
    highRisk: 0,
    adherenceRate: 0
  });

  const [patientsData, setPatientsData] = useState([]);
  const [defaultersData, setDefaultersData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReportData();
  }, []);

  const fetchReportData = async () => {
    try {
      setLoading(true);
      const [patientsRes, defaultersRes] = await Promise.all([
        patientsAPI.getAllPatients(),
        defaultersAPI.getAllDefaulters()
      ]);

      const patients = patientsRes.patients || patientsRes.data || [];
      const defaulters = defaultersRes.defaulters || defaultersRes.data || [];

      setPatientsData(patients);
      setDefaultersData(defaulters);

      const activePatients = patients.filter(p => p.is_active !== false).length;
      const highRiskCount = defaulters.filter(d => (d.risk_level === 'high' || d.days_missed > 7)).length;

      setStats({
        totalPatients: patients.length,
        totalDefaulters: defaulters.length,
        highRisk: highRiskCount,
        adherenceRate: patients.length > 0 
          ? Math.round(((activePatients - defaulters.length) / activePatients) * 100) 
          : 0
      });

      setLoading(false);
    } catch (err) {
      console.error('Error fetching report data:', err);
      showToast({ type: 'error', message: 'Failed to load report data' });
      setLoading(false);
    }
  };

  // 📄 PDF GENERATOR (FIXED VERSION)
  const generatePDF = () => {
    try {
      const doc = new jsPDF();

      // 1. Header Banner
      doc.setFillColor(59, 130, 246);
      doc.rect(0, 0, 210, 40, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(22);
      doc.text('ARV Defaulter Tracking System', 105, 20, { align: 'center' });
      doc.setFontSize(12);
      doc.text(`Official System Report - ${new Date().toLocaleDateString()}`, 105, 30, { align: 'center' });

      // 2. Executive Summary Table
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(14);
      doc.text('1. Executive Summary', 14, 55);
      
      const summaryData = [
        ['Metric', 'Current Value', 'Metric', 'Current Value'],
        ['Total Patients', stats.totalPatients, 'Adherence Rate', `${stats.adherenceRate}%`],
        ['Active Defaulters', stats.totalDefaulters, 'High Risk Cases', stats.highRisk],
      ];

      // 👇 THE FIX: autoTable(doc, options) instead of doc.autoTable(options)
      autoTable(doc, {
        startY: 60,
        body: summaryData,
        theme: 'grid',
        styles: { fontSize: 10, cellPadding: 4 },
        columnStyles: { 
          0: { fontStyle: 'bold', fillColor: [240, 240, 240] },
          2: { fontStyle: 'bold', fillColor: [240, 240, 240] } 
        }
      });

      // 3. Defaulter Details Table
      // Get the Y position where the previous table ended
      const finalY = (doc.lastAutoTable && doc.lastAutoTable.finalY) || 80;
      
      doc.setFontSize(14);
      doc.text('2. High-Priority Defaulters List', 14, finalY + 15);

      const tableData = defaultersData.map(d => [
        d.patient_name || 'Unknown',
        d.patient_number || 'N/A',
        `${d.days_missed || 0} days`,
        d.risk_level?.toUpperCase() || 'MEDIUM',
        d.phone_number || 'N/A'
      ]);

      // 👇 THE FIX: Using autoTable(doc, ...) again
      autoTable(doc, {
        startY: finalY + 20,
        head: [['Patient Name', 'ID', 'Days Missed', 'Risk', 'Contact']],
        body: tableData.length > 0 ? tableData : [['No active defaulters', '', '', '', '']],
        headStyles: { fillColor: [59, 130, 246] },
        alternateRowStyles: { fillColor: [249, 250, 251] }
      });

      doc.save('ARV_System_Report.pdf');
      showToast({ type: 'success', message: 'PDF generated successfully' });

    } catch (error) {
      console.error("PDF Generation Error:", error);
      showToast({ type: 'error', message: 'Error generating PDF. Check console.' });
    }
  };

  // 📊 EXCEL GENERATOR
  const generateExcel = () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(patientsData);
    XLSX.utils.book_append_sheet(wb, ws, "Patients");
    
    const ws2 = XLSX.utils.json_to_sheet(defaultersData);
    XLSX.utils.book_append_sheet(wb, ws2, "Defaulters");

    XLSX.writeFile(wb, "ARV_System_Data.xlsx");
    showToast({ type: 'success', message: 'Excel file exported' });
  };

  const adherenceTrendData = {
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
    datasets: [{
      label: 'Adherence %',
      data: [85, 87, 84, 89, 91, stats.adherenceRate],
      borderColor: '#10b981',
      backgroundColor: 'rgba(16, 185, 129, 0.1)',
      fill: true,
      tension: 0.4
    }]
  };

  if (loading) return <div className="loading-state"><div className="spinner"></div><p>Preparing reports...</p></div>;

  return (
    <div className="reports-page">
      <div className="reports-header">
        <h2 className="reports-title">System Reports & Exports</h2>
        <div className="reports-date">As of {new Date().toLocaleDateString()}</div>
      </div>

      <div className="export-cards-container">
        <div className="export-card" onClick={generatePDF}>
          <div className="export-icon pdf">📄</div>
          <div className="export-text">
            <h3>Download PDF Report</h3>
            <p>Official summary with tables and branding.</p>
          </div>
        </div>

        <div className="export-card" onClick={generateExcel}>
          <div className="export-icon excel">📊</div>
          <div className="export-text">
            <h3>Export to Excel</h3>
            <p>Full raw data for advanced analysis.</p>
          </div>
        </div>
      </div>

      <div className="reports-visuals">
        <div className="report-chart-box">
          <h3>Adherence Performance Trend</h3>
          <div className="chart-inner">
            <LineChart data={adherenceTrendData} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default Reports;