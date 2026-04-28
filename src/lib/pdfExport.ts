import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { PickupLog, RegistryEntry } from '../types';

export const exportLogsToPDF = (logs: PickupLog[]) => {
  const doc = new jsPDF();
  
  // Header
  doc.setFontSize(22);
  doc.setTextColor(16, 185, 129); // Accent Emerald
  doc.text('GUARDLINK SECURE', 105, 20, { align: 'center' });
  
  doc.setFontSize(12);
  doc.setTextColor(100);
  doc.text('Authorized Pickup Log Sheet', 105, 30, { align: 'center' });
  doc.text(`Generated on: ${new Date().toLocaleString()}`, 105, 38, { align: 'center' });
  
  const tableData = logs.map(log => [
    log.studentName,
    log.scholarNo,
    log.classSec,
    `${log.guardianName} (${log.guardianRole})`,
    new Date(log.timestamp).toLocaleDateString(),
    new Date(log.timestamp).toLocaleTimeString()
  ]);

  autoTable(doc, {
    startY: 45,
    head: [['Student Name', 'Scholar No', 'Class/Sec', 'Verified Guardian', 'Date', 'Time']],
    body: tableData,
    headStyles: { fillColor: [16, 185, 129] },
    alternateRowStyles: { fillColor: [245, 245, 245] },
  });

  doc.save(`guardlink-pickups-${new Date().toISOString().split('T')[0]}.pdf`);
};

export const exportRegistryToPDF = (registry: RegistryEntry[]) => {
  const doc = new jsPDF();
  
  doc.setFontSize(22);
  doc.setTextColor(16, 185, 129);
  doc.text('GUARDLINK SECURE', 105, 20, { align: 'center' });
  
  doc.setFontSize(12);
  doc.setTextColor(100);
  doc.text('Complete Registered Database', 105, 30, { align: 'center' });
  
  const tableData = registry.map(p => [
    '', // Placeholder for student photo
    p.childName,
    p.scholarNo,
    p.classSec,
    p.guardians?.map(g => `${g.role}: ${g.name}`).join('\n') || '',
    '', // Placeholder for primary guardian photo
    new Date(p.createdAt).toLocaleDateString()
  ]);

  autoTable(doc, {
    startY: 40,
    head: [['Stu. Photo', 'Student Name', 'Scholar ID', 'Class/Sec', 'Authorized Guardians', 'Guard. Photo', 'Reg Date']],
    body: tableData,
    styles: { minCellHeight: 30, valign: 'middle', fontSize: 9 },
    headStyles: { fillColor: [16, 185, 129] },
    didDrawCell: (data) => {
      if (data.section === 'body' && (data.column.index === 0 || data.column.index === 5)) {
        const item = registry[data.row.index];
        const photo = data.column.index === 0 ? item.studentPhoto : item.guardians[0]?.photo;
        if (photo) {
          doc.addImage(photo, 'JPEG', data.cell.x + 2, data.cell.y + 2, 20, 20);
        }
      }
    }
  });

  doc.save(`guardlink-registry-${new Date().toISOString().split('T')[0]}.pdf`);
};

export const exportTechnicalDoc = () => {
  const doc = new jsPDF();
  doc.setFontSize(22);
  doc.setTextColor(16, 185, 129);
  doc.text('TECHNICAL DOCUMENTATION', 20, 20);
  
  doc.setFontSize(14);
  doc.setTextColor(0);
  doc.text('GUARDLINK SECURE BIOMETRIC SYSTEM', 20, 30);
  
  doc.setFontSize(10);
  const text = `
    1. SYSTEM OVERVIEW
    GuardLink Secure is a biometric verification system for educational institutions.
    
    2. ARCHITECTURE
    - Framework: React 18 / Vite
    - Biometrics: face-api.js (Web-based SSD/TinyFace)
    - Storage: LocalStorage (Offline-first)
    
    3. SECURITY PROTOCOL
    The system implements a Dual-Face Handshake. Enrollment requires capturing:
    - Guardian Biometric Signature (128-bit Vector)
    - Student Biometric Signature (128-bit Vector)
    
    4. ACCURACY TUNING
    - Detection Threshold: 0.5
    - Recognition Threshold: 0.45 (Euclidean Distance)
  `;
  doc.text(text, 20, 40);
  doc.save('GuardLink-Technical-Doc.pdf');
};

export const exportPresentationDoc = () => {
  const doc = new jsPDF();
  doc.setFontSize(22);
  doc.setTextColor(16, 185, 129);
  doc.text('SYSTEM PRESENTATION', 20, 20);
  
  doc.setFontSize(16);
  doc.setTextColor(0);
  doc.text('The GuardLink Mission', 20, 35);
  
  doc.setFontSize(11);
  const text = `
    THE CHALLENGE:
    Manual verification during school pickup is slow and dangerous.
    
    THE GUARDLINK SOLUTION:
    A biometric "handshake" that validates both parties simultaneously.
    
    BENEFITS:
    - Zero Identity Theft Risks
    - Automated Daily Audit Logs
    - Enhanced School Liability Protection
    - Parents Peace of Mind
  `;
  doc.text(text, 20, 45);
  doc.save('GuardLink-Pitch-Deck.pdf');
};
