# Technical Documentation: GuardLink Secure

## 1. System Overview
GuardLink Secure is a high-performance biometric verification system designed for educational institutions to secure the student pickup process. It utilizes facial recognition technology to ensure that only authorized guardians can pick up students.

## 2. Tech Stack
- **Frontend**: React 18 with Vite
- **Biometrics**: face-api.js (TensorFlow.js based)
- **Styling**: Tailwind CSS
- **PDF Generation**: jsPDF & AutoTable
- **Icons**: Lucide React
- **Animations**: Framer Motion (motion/react)

## 3. Core Features
### Dual Biometric Verification
The system requires both the parent/guardian and the student to be present at the pickup point. The system scans the live feed and matches both faces against the stored registry before enabling the "Release" option.

### Administrative Controls
- **Biometric Enrollment**: 3-step process (Details -> Parent Capture -> Student Capture).
- **Registry Management**: Password-protected dashboard to view all registered profiles and revoke access.
- **Audit Logging**: Automated time-stamped recording of every student pickup.

## 4. Technical Specifications
### Face Detection Model
Uses the `TinyFaceDetector` for real-time performance on web browsers. It balance speed and accuracy, suitable for high-traffic school gates.
- **Input Size**: 224px
- **Score Threshold**: 0.5

### Data Storage
Currently utilizes `localStorage` for the biometric database (registry) and audit logs. Face descriptors are stored as serialized Float32Arrays.

### Security Implementation
- **Client-side matching**: No biometric data is sent to a central server in this demo version, ensuring privacy.
- **Password Protection**: Admin panel uses a master access token ("admin123").

## 5. Deployment & Maintenance
The application is served as an SPA. Biometric models are loaded from a CDN on initialization.
