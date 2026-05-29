/**
 * SECURITY MANIFEST & LICENSE ENGINE
 * This file contains the proprietary logic for license generation and validation.
 * RESTRICTED: For Developer Eyes Only.
 */

// Secret Constants - Do not expose to UI
const _S = [0x5A, 0x1F, 0x3C]; // Salt multi-layer
const ENGINE_CONFIG = {
  IDENTIFIER: "1808", // Updated identifier
  SIG: "DM",
  MIN_LEN: 19, // Updated for new format DM1808-DDMMYYYY-Days
  XOR: () => _S[0] ^ _S[1] // Computed at runtime
};

export interface LicenseCheckResult {
  valid: boolean;
  expiry?: number;
  error?: string;
  daysRemaining?: number; // Add daysRemaining
}

/**
 * Advanced Obfuscation Layer
 */
const transform = (input: string): string => {
  const salt = ENGINE_CONFIG.XOR();
  return btoa(input.split('').map(char => 
    String.fromCharCode(char.charCodeAt(0) ^ salt)
  ).join(''));
};

const reverseTransform = (input: string): string => {
  try {
    const salt = ENGINE_CONFIG.XOR();
    const decoded = atob(input);
    return decoded.split('').map(char => 
      String.fromCharCode(char.charCodeAt(0) ^ salt)
    ).join('');
  } catch {
    return "";
  }
};

/**
 * Validates the obfuscated license signature: DM1808-DDMMYYYY-Days
 */
export const validateLicense = (obfuscatedKey: string): LicenseCheckResult => {
  try {
    const key = reverseTransform(obfuscatedKey);
    // Format: DM1808-DDMMYYYY-Days
    if (!key || key.length < ENGINE_CONFIG.MIN_LEN) {
      return { valid: false, error: "ERR_SIG_LEN" };
    }

    const parts = key.split('-');
    if (parts.length !== 3) return { valid: false, error: "ERR_FORMAT" };

    const sigIdPart = parts[0]; // DM1808
    const sig = sigIdPart.substring(0, 2);
    const id = sigIdPart.substring(2, 6);
    
    if (sig !== ENGINE_CONFIG.SIG || id !== ENGINE_CONFIG.IDENTIFIER) {
      return { valid: false, error: "ERR_SIG_VOID" };
    }

    const datePart = parts[1]; // DDMMYYYY
    const daysPart = parts[2]; // Days

    const day = parseInt(datePart.substring(0, 2));
    const month = parseInt(datePart.substring(2, 4)) - 1;
    const year = parseInt(datePart.substring(4, 8));
    const durationDays = parseInt(daysPart);

    const activationDate = new Date(year, month, day);
    if (isNaN(activationDate.getTime())) {
      return { valid: false, error: "ERR_TS_VOID" };
    }

    const expiryTime = activationDate.getTime() + (durationDays * 24 * 60 * 60 * 1000);
    const now = Date.now();
    const daysRemaining = Math.max(0, Math.ceil((expiryTime - now) / (1000 * 60 * 60 * 24)));
    
    return { valid: true, expiry: expiryTime, daysRemaining };
  } catch (e) {
    return { valid: false, error: "ERR_SYSTEM" };
  }
};

/**
 * Generates an obfuscated signature (Internal)
 */
export const generateLicense = (days: number): string => {
  const now = new Date();
  const dateStr = 
    now.getDate().toString().padStart(2, '0') + 
    (now.getMonth() + 1).toString().padStart(2, '0') + 
    now.getFullYear().toString();
  
  const daysStr = days.toString().padStart(3, '0');
  
  const rawKey = `${ENGINE_CONFIG.SIG}${ENGINE_CONFIG.IDENTIFIER}-${dateStr}-${daysStr}`;
  return transform(rawKey);
};
