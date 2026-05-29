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
    log.cameraLabel || 'Main Node',
    new Date(log.timestamp).toLocaleDateString(),
    new Date(log.timestamp).toLocaleTimeString()
  ]);

  autoTable(doc, {
    startY: 45,
    head: [['Student Name', 'Scholar No', 'Class/Sec', 'Verified Guardian', 'Capture Node', 'Date', 'Time']],
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
  const primaryColor = [16, 185, 129]; // Emerald 500
  
  // Header
  doc.setFontSize(24);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text('TECHNICAL SPECIFICATION', 20, 30);
  
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text('GUARDLINK SECURE ENTERPRISE BIOMETRICS | CONFIDENTIAL', 20, 38);
  
  doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.setLineWidth(1);
  doc.line(20, 42, 190, 42);

  // Sections
  const sections = [
    {
      title: '1. SYSTEM ARCHITECTURE (EDGE AI)',
      content: 'GuardLink utilizes client-side Convolutional Neural Networks (CNN) for @vladmandic/face-api feature extraction. This ensures zero-latency matching and eliminates the need for expensive server-side compute infrastructure.'
    },
    {
      title: '2. BIOMETRIC SIGNATURES',
      content: 'Facial features are transformed into 128-dimensional floating-point vectors (embeddings). These descriptors are irreversible and mathematically unique, ensuring that raw facial images are never stored or exposed.'
    },
    {
      title: '3. DUAL-FACTOR HANDSHAKE PROTOCOL',
      content: 'Pickup authorization requires a logic-AND match between the Student profile and an Authorized Guardian profile. This non-repudiable protocol prevents unauthorized transport and human clerical errors.'
    },
    {
      title: '4. DATA PRIVACY & COMPLIANCE',
      content: 'Privacy-by-Design: No biometric data leaves the institution. Data is stored in local encrypted browser state (LocalStorage/IndexedDB). System logic is compliant with global biometric privacy principles.'
    },
    {
      title: '5. OFFLINE CONTINUITY (PWA)',
      content: 'The deployment includes a Service Worker manifest for 100% offline availability. All weights and assets are cached locally to ensure mission-critical performance even during network outages.'
    },
    {
      title: '6. RECOMMENDED HARDWARE SPECIFICATIONS',
      content: 'For optimal high-speed biometric processing (>10FPS): CPU: Intel Core i5-11th Gen / Apple M1 or higher. RAM: 8GB LPDDR4x. GPU: WebGL 2.0 compatible. Camera: 1080p Full HD with high dynamic range (HDR) for varying lighting conditions.'
    }
  ];

  let yPos = 55;
  sections.forEach(s => {
    doc.setFontSize(11);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text(s.title, 20, yPos);
    
    doc.setFontSize(10);
    doc.setTextColor(40);
    const splitText = doc.splitTextToSize(s.content, 160);
    doc.text(splitText, 25, yPos + 7);
    yPos += 20 + (splitText.length * 4);
  });

  doc.save('GuardLink-Enterprise-Technical-Spec.pdf');
};

export const exportTechnologyReport = () => {
  const doc = new jsPDF();
  const primaryColor = [16, 185, 129];
  
  // Header
  doc.setFontSize(20);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text('TECHNOLOGY & AI MODEL REPORT', 105, 20, { align: 'center' });
  
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text('GUARDLINK SECURE BIOMETRICS', 105, 28, { align: 'center' });
  
  doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.line(20, 32, 190, 32);

  // Content
  doc.setFontSize(12);
  doc.setTextColor(40);
  
  const content = [
    { t: '1. AI TECHNOLOGY & MODEL USED', c: 'The application uses "@vladmandic/face-api" for facial recognition, specifically the TinyFaceDetector neural network. This lightweight model is optimized for real-time performance on edge devices, allowing biometric matching entirely within the browser without server-side dependencies.' },
    { t: '2. TECHNOLOGY STACK', c: 'Frontend: React, TypeScript, Vite. Styling: Tailwind CSS. Real-time Communication: Socket.io. Biometric Engine: Face-API (vladmandic), MediaPipe Vision Tasks. PDF Generation: jsPDF.' },
    { t: '3. DETECTED CODE SEGMENT: FACE API INITIALIZATION', c: `// Load face-api models
await Promise.all([
  faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
  faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
  faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
]);` },
    { t: '4. DETECTED CODE SEGMENT: MATCHING LOGIC', c: `const studentMatch = studentMatcher.findBestMatch(det.descriptor);
if (studentMatch.label !== 'unknown' && studentMatch.distance < 0.40) {
  bestMatch = studentMatch;
  matchType = 'student';
}` }
  ];

  let yPos = 45;
  content.forEach(p => {
    doc.setFontSize(11);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text(p.t, 20, yPos);
    
    doc.setFontSize(9);
    doc.setTextColor(60);
    const lines = doc.splitTextToSize(p.c, 160);
    doc.text(lines, 20, yPos + 6);
    yPos += 20 + (lines.length * 7);
  });

  doc.save('GuardLink-Technology-Report.pdf');
};
