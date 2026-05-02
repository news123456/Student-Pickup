# 🔐 Student-Pickup: Advanced License System Guide

## 📋 Table of Contents
1. [System Overview](#system-overview)
2. [Installation & Setup](#installation--setup)
3. [Using the License System](#using-the-license-system)
4. [Security Architecture](#security-architecture)
5. [Troubleshooting](#troubleshooting)

---

## System Overview

**GuardLink Secure** is now enhanced with a military-grade license system that:
- ✅ Restricts access to **superadmin only** for license management
- ✅ Generates time-based license keys tied to school names
- ✅ Prevents date tampering and system clock manipulation
- ✅ Uses **AES-256-GCM encryption** and **HMAC-SHA256** for integrity
- ✅ Blocks the entire app if the license is invalid/expired

---

## Installation & Setup

### 1. **Prerequisites**
- Node.js (v16 or higher)
- npm or yarn
- Git

### 2. **Install Dependencies**
```bash
cd "d:\Rewati\Others\Practices\Devendra Maurya Sir\Student-Pickup"
npm install
```

### 3. **Run Development Server**
```bash
npm run dev
```

The app will start at **http://localhost:3003**

### 4. **Build for Production**
```bash
npm run build
npm run preview
```

---

## Using the License System

### **Default Superadmin Credentials**
- **Username**: Superadmin
- **Password**: `superadmin123` (change this immediately!)

### **Step 1: Generate a License Key** 🔑

1. Open the app: http://localhost:3003
2. Navigate to **Admin** tab → **License** (red button)
3. Click **AUTHENTICATE** and enter the superadmin password: `superadmin123`
4. In the "Generate Key" section, fill in:
   - **School Name**: E.g., "ABC High School" → takes first 4 letters: `ABCH`
   - **Days**: Number of days license is valid (1-999), e.g., `365` for 1 year
   - **Date**: Activation date in DDMMYYYY format, e.g., `02052026` (May 2, 2026)
5. Click **GENERATE KEY**
6. Copy the generated key (e.g., `ABCH36502052026`)

### **Step 2: Activate License** 🚀

1. Share the license key with the school admin
2. In the **Activate License** section:
   - Paste the license key
   - Click **ACTIVATE**
3. If successful, you'll see: ✅ **"License valid."**

### **Step 3: Access the App** 📱

Once activated:
- The app will be fully functional
- All features (Scanner, Enroll, Logs, Admin) are accessible
- License validity is checked on every app start
- Date tampering is detected and prevented

---

## License Key Format

```
[ABCH][365][02052026]
```

| Part | Length | Description | Example |
|------|--------|-------------|---------|
| School Initials | 4 chars | First 4 uppercase letters of school name | `ABCH` |
| Days | 3 digits | Validity period (1-999 days) | `365` |
| Activation Date | 8 digits | DDMMYYYY format | `02052026` |

**Examples:**
- School "Global Institute" (365 days, May 2, 2026): `GLOB36502052026`
- School "XYZ" (90 days, Jan 1, 2026): `XYZX09001012026`

---

## Security Architecture

### **Encryption**
- **Algorithm**: AES-256-GCM (256-bit encryption)
- **Key Derivation**: PBKDF2 with 100,000 iterations
- **Mode**: Galois/Counter Mode for authenticated encryption
- **Storage**: Encrypted in browser's localStorage

### **Integrity Protection**
- **HMAC Algorithm**: SHA-256
- **Purpose**: Detect any tampering with license data
- **Verification**: On every app start and periodic checks

### **Anti-Tampering Measures**
1. **Date Rollback Detection**: If system date goes backward before activation date
2. **Future Date Prevention**: If date is too far ahead (>30 days from last check)
3. **Timestamp Validation**: Encrypted activation timestamp prevents manipulation
4. **Device Binding**: License tied to browser storage ID (optional enhancement)

### **Superadmin Protection**
- Superadmin password is stored **locally** (not sent to server)
- Can be changed in License → Superadmin Settings
- Only superadmin can generate/manage licenses
- Regular admins cannot access license features

---

## Feature Comparison

| Feature | Admin | Superadmin |
|---------|-------|-----------|
| View Registry | ✅ | ✅ |
| Manage Settings | ✅ | ✅ |
| Change Admin Password | ✅ | ✅ |
| **Generate License Keys** | ❌ | ✅ |
| **Activate License** | ❌ | ✅ |
| **Change Superadmin Password** | ❌ | ✅ |

---

## Common Tasks

### **Change Superadmin Password**
1. Go to Admin → License
2. Authenticate with current password
3. In "Superadmin Settings" → "Change Superadmin Password"
4. Enter new password and click **UPDATE PASSWORD**

### **License Expired?**
1. Contact superadmin to generate a new key
2. New key can have extended validity (e.g., 365 days)
3. Use Admin → License → **Activate License** to apply

### **System Date Changed?**
1. The license system detects date manipulation
2. App will show: "System date appears manipulated"
3. Verify correct date in system settings
4. Refresh the browser to retry validation

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| **"License Required" screen on startup** | Generate and activate a valid license key |
| **"License integrity compromised"** | License data is corrupted; activate a new key |
| **"System date is before activation date"** | Check system clock; ensure date is not in past |
| **"System time appears manipulated"** | Don't change system date; sync with NTP if needed |
| **Superadmin password incorrect** | Default is `superadmin123`; change if already updated |
| **WebSocket connection errors** | Ensure server is running; check port 3003 is available |

---

## API Integration (Backend)

### **License Routes** (Optional Server-side)
For online license validation, the backend can support:

```
POST /api/license/validate
- Body: { key: string, schoolName: string }
- Returns: { valid: boolean, expiryDate: string }

POST /api/license/revoke
- Body: { key: string }
- Purpose: Revoke compromised keys
```

(Not implemented in this version; for future enterprise features)

---

## Best Practices

✅ **DO:**
- Change default superadmin password immediately
- Keep license keys secure and encrypted
- Use long-lived licenses (90-365 days) for institutions
- Audit license activations regularly
- Test license expiry before actual expiration

❌ **DON'T:**
- Share superadmin password with regular staff
- Manually edit localStorage to bypass license checks
- Disable browser's storage encryption
- Use same license key across multiple institutions
- Expose license keys in public repositories

---

## Roadmap: Future Enhancements

🔮 **Planned Features:**
- Online license server validation
- License revocation mechanism
- Multi-tenant support (one key per campus)
- License renewal notifications (30 days before expiry)
- Server-side license audit logs
- Integration with school management systems
- SMS/Email license expiry alerts

---

## Support & Contact

For issues or feature requests:
1. Check the **Troubleshooting** section
2. Review system logs in browser Console (F12)
3. Contact the development team with:
   - Error message (if any)
   - Superadmin username
   - License key (first & last 4 chars only for privacy)
   - Device info (browser, OS)

---

**GuardLink Secure v2.0** | *Intelligent Safety. Zero Compromise.* 🛡️
