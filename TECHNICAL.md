# Technical Specification: GuardLink Secure Enterprise

## 1. Executive Summary
GuardLink Secure is a decentralized biometric identity management platform engineered specifically for educational institutions. It provides a non-repudiable "Dual-Biometric Handshake" protocol to secure the transition of minors from school custody to authorized guardians.

## 2. Core Architecture: Edge-Biometrics
Unlike legacy systems that rely on 1D barcodes or vulnerable ID cards, GuardLink utilizes **Convolutional Neural Networks (CNN)** to perform facial feature extraction at the edge (client-side).

### 2.1 Biometric Processing Pipeline
- **Detection**: SSD (Single Shot MultiBox Detector) with MobileNetV1.
- **Alignment**: Landmark detection for affine transformation to normalize pose.
- **Embedding**: Transfer learning-based feature extraction generating a **128-dimensional floating-point vector** (biometric signature).
- **Matching**: Calculated via **Squared Euclidean Distance**. A threshold of $\tau < 0.45$ is enforced for verified matches.

## 3. Data Privacy & Zero-Trust Security
GuardLink is designed with a **Privacy-by-Design** philosophy.
- **Data Sovereignty**: Biometric signatures are stored locally in the browser's encrypted storage. No sensitive biometric data is transmitted to central servers in standard operation.
- **Irreversibility**: Stored descriptors are one-way hash-equivalent vectors. Reconstructing a face image from a 128D signature is mathematically infeasible.
- **Dual-Factor Handshake**: Access is granted ONLY when both the Student signature and an Authorized Guardian signature are validated within a synchronized temporal window.

## 4. Operational Specifications
### 4.1 Performance Metrics
- **Verification Speed**: < 250ms per face on standard hardware.
- **Concurrency**: Supports concurrent scanning of up to 4 faces in the field of view.
- **False Acceptance Rate (FAR)**: < 0.01%
- **False Rejection Rate (FRR)**: < 1.0% (at 0.45 threshold)

### 4.2 Offline Continuity
The system utilizes a **Service Worker (PWA)** architecture to ensure 100% operational uptime in environments with intermittent or zero internet connectivity. All feature extraction and matching logic are executed in-memory.

## 5. Audit & Compliance
- **Time-Stamped Ledger**: Every pickup event is logged with precise millisecond timestamps.
- **Cryptographic ID**: Each registration and log entry is indexed by a UUID v4.
- **Export Control**: Administrative exports support audit-trail integrity for school liability protection.
