# Security and Enterprise Hardening Plan

This document outlines the architectural approach to address the requested security concerns for an offline-capable, enterprise-ready application.

## 1. Code Anti-Tampering & Piracy Mitigation
- **Backend-Native Obfuscation:** Critical licensing logic will be moved to a pre-compiled Node.js binary, making reverse-engineering difficult.
- **Runtime Integrity Checks:** Implement checksum validation on critical source files (`App.tsx`, `server.ts`) at startup. If the hash changes (tampering), the engine will refuse to boot.
- **Clock Drift Detection:** Actively monitor system clock regressions to prevent license duration bypass via time manipulation. (Implemented: `isTampered` state tracking).

## 2. Configuration & Identity
- **Centralized Configuration:** Move all hardcoded secrets and config to an encrypted environment-variables-backed store, not inside the source code.
- **Authenticity Signing:** Every configuration change will be cryptographically signed by an internal key before being persisted to `settings.json`.

## 3. Data-at-Rest Encryption (AES-256)
- **Encryption Engine:** Implement an AES-256 encryption layer for `data/*.json` files.
- **Key Derivation (KDF):** Keys will be derived from a hardware-tied machine identifier, preventing the data from being decrypted if copied to another machine.
- **Decryption Workflow:**
  1. Bootload decrypted config into memory.
  2. Perform volatile operations in encrypted memory buffers.
  3. Flush to disk only in encrypted form.

## 4. Vulnerability Remediation (CI/CD Pipeline)
- **Dependency Guard:** Implement a periodic `npm audit` and runtime dependency locking for all packages.
- **OS Hardening:** Package the applet in a strictly isolated, read-only Docker container (when deployed to production) to ensure OS-level vulnerabilities cannot impact the data layer.

## Implementation Roadmap
1. **Immediate:** Integrity monitoring (already started in `App.tsx`) and robust API error reporting.
2. **Phase 1:** Implement AES-256 encryption for all JSON data stores (`data/*.json`).
3. **Phase 2:** Move licensing logic to native binaries.
4. **Phase 3:** Harden the deployment environment.
