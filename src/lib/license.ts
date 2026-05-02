export interface LicenseData {
  schoolInitials: string;
  days: number;
  activationDate: string; // DDMMYYYY
  activationTimestamp: number; // Unix timestamp
  hmac: string; // For integrity
}

const LICENSE_KEY = 'guardlink_license_v1';
const SUPERADMIN_PASSWORD_KEY = 'guardlink_superadmin_password';
const DEFAULT_SUPERADMIN_PASSWORD = 'superadmin123'; // Change in production

// Fixed salt: schoolInitials live *inside* the encrypted payload, so they aren't
// known at decrypt time and cannot participate in key derivation.
async function deriveKey(): Promise<CryptoKey> {
  const secret = 'GuardLinkSecure2026';
  const salt = new TextEncoder().encode('GuardLinkSalt_v1');
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptData(data: string): Promise<string> {
  const key = await deriveKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(data)
  );
  return btoa(String.fromCharCode(...iv) + String.fromCharCode(...new Uint8Array(encrypted)));
}

async function decryptData(encryptedData: string): Promise<string> {
  const key = await deriveKey();
  const data = atob(encryptedData);
  const iv = new Uint8Array(data.slice(0, 12).split('').map(c => c.charCodeAt(0)));
  const encrypted = new Uint8Array(data.slice(12).split('').map(c => c.charCodeAt(0)));
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    encrypted
  );
  return new TextDecoder().decode(decrypted);
}

// Generate HMAC for integrity
async function generateHMAC(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode('LicenseIntegrityKey2026'), // Obfuscate
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

// Verify HMAC
async function verifyHMAC(data: string, hmac: string): Promise<boolean> {
  const expectedHMAC = await generateHMAC(data);
  return expectedHMAC === hmac;
}

// Generate license key
export function generateLicenseKey(schoolName: string, days: number, activationDate: string): string {
  const initials = schoolName.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 4).padEnd(4, 'X');
  const daysStr = days.toString().padStart(3, '0');
  return `${initials}${daysStr}${activationDate}`;
}

// Validate license key format
export function validateLicenseKeyFormat(key: string): boolean {
  const regex = /^[A-Z]{4}\d{3}\d{8}$/;
  return regex.test(key);
}

// Parse license key
export function parseLicenseKey(key: string): { schoolInitials: string; days: number; activationDate: string } {
  const schoolInitials = key.slice(0, 4);
  const days = parseInt(key.slice(4, 7));
  const activationDate = key.slice(7);
  return { schoolInitials, days, activationDate };
}

// Activate license
export async function activateLicense(key: string): Promise<boolean> {
  if (!validateLicenseKeyFormat(key)) return false;

  const { schoolInitials, days, activationDate } = parseLicenseKey(key);
  const activationTimestamp = Date.now();

  const data = JSON.stringify({ schoolInitials, days, activationDate, activationTimestamp });
  const hmac = await generateHMAC(data);

  const licenseData: LicenseData = { schoolInitials, days, activationDate, activationTimestamp, hmac };
  const encrypted = await encryptData(JSON.stringify(licenseData));

  localStorage.setItem(LICENSE_KEY, encrypted);
  return true;
}

// Validate license
export async function validateLicense(): Promise<{ valid: boolean; message: string }> {
  const encrypted = localStorage.getItem(LICENSE_KEY);
  if (!encrypted) return { valid: false, message: 'No license found. Please activate a license.' };

  try {
    const decrypted = await decryptData(encrypted);
    const licenseData: LicenseData = JSON.parse(decrypted);

    // Verify integrity
    const data = JSON.stringify({
      schoolInitials: licenseData.schoolInitials,
      days: licenseData.days,
      activationDate: licenseData.activationDate,
      activationTimestamp: licenseData.activationTimestamp
    });
    if (!(await verifyHMAC(data, licenseData.hmac))) {
      return { valid: false, message: 'License integrity compromised.' };
    }

    // Parse activation date
    const day = parseInt(licenseData.activationDate.slice(0, 2));
    const month = parseInt(licenseData.activationDate.slice(2, 4)) - 1;
    const year = parseInt(licenseData.activationDate.slice(4));
    const activationDate = new Date(year, month, day);

    // Calculate expiry
    const expiryDate = new Date(activationDate);
    expiryDate.setDate(expiryDate.getDate() + licenseData.days);

    const now = new Date();

    // Check if current time is before activation
    if (now < activationDate) {
      return { valid: false, message: 'System date is before activation date. Please check your clock.' };
    }

    // Check if expired
    if (now > expiryDate) {
      return { valid: false, message: `License expired on ${expiryDate.toDateString()}. Please renew.` };
    }

    // Check if system time seems manipulated (too far ahead)
    const timeDiff = now.getTime() - licenseData.activationTimestamp;
    if (timeDiff < 0 || timeDiff > (licenseData.days + 30) * 24 * 60 * 60 * 1000) {
      return { valid: false, message: 'System time appears manipulated. Please verify your date settings.' };
    }

    return { valid: true, message: 'License valid.' };
  } catch (error) {
    return { valid: false, message: 'Invalid license data.' };
  }
}

// Superadmin functions
export function setSuperadminPassword(password: string) {
  localStorage.setItem(SUPERADMIN_PASSWORD_KEY, password);
}

export function getSuperadminPassword(): string {
  return localStorage.getItem(SUPERADMIN_PASSWORD_KEY) || DEFAULT_SUPERADMIN_PASSWORD;
}

export function authenticateSuperadmin(password: string): boolean {
  return password === getSuperadminPassword();
}