/**
 * SECURITY MANIFEST & LICENSE ENGINE
 * This file contains the proprietary logic for license generation and validation.
 * RESTRICTED: For Developer Eyes Only.
 */

// Secret Constants - Do not expose to UI
const _S = [0x5A, 0x1F, 0x3C]; // Salt multi-layer
const ENGINE_CONFIG = {
  IDENTIFIER: "1802",
  SIG: "DM",
  MIN_LEN: 22,
  XOR: () => _S[0] ^ _S[1] // Computed at runtime
};

export interface LicenseCheckResult {
  valid: boolean;
  expiry?: number;
  error?: string;
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
 * Validates the obfuscated license signature
 */
export const validateLicense = (obfuscatedKey: string, schoolName?: string): LicenseCheckResult => {
  try {
    const key = reverseTransform(obfuscatedKey);
    if (!key || key.length < ENGINE_CONFIG.MIN_LEN) {
      return { valid: false, error: "ERR_SIG_LEN" };
    }

    const datePart = key.substring(0, 8);
    const daysPart = key.substring(8, 12);
    const schoolPart = key.substring(12, 16);
    const fixedPart = key.substring(16, 20);
    const suffixPart = key.substring(20, 22);

    // Deep Integrity Check
    if (fixedPart !== ENGINE_CONFIG.IDENTIFIER || suffixPart !== ENGINE_CONFIG.SIG) {
      return { valid: false, error: "ERR_SIG_VOID" };
    }

    if (schoolName) {
      const expectedSchoolSig = schoolName.substring(0, 4).toUpperCase().padEnd(4, 'X');
      if (schoolPart !== expectedSchoolSig) {
        return { valid: false, error: "ERR_SCHOOL_AUTH" };
      }
    }

    const year = parseInt(datePart.substring(0, 4));
    const month = parseInt(datePart.substring(4, 6)) - 1;
    const day = parseInt(datePart.substring(6, 8));
    const durationDays = parseInt(daysPart);

    const activationDate = new Date(year, month, day);
    if (isNaN(activationDate.getTime())) {
      return { valid: false, error: "ERR_TS_VOID" };
    }

    const expiryTime = activationDate.getTime() + (durationDays * 24 * 60 * 60 * 1000);
    
    return { valid: true, expiry: expiryTime };
  } catch (e) {
    return { valid: false, error: "ERR_SYSTEM" };
  }
};

/**
 * Generates an obfuscated signature (Internal)
 */
export const generateLicense = (days: number, schoolName: string): string => {
  const now = new Date();
  const dateStr = now.getFullYear().toString() + 
                  (now.getMonth() + 1).toString().padStart(2, '0') + 
                  now.getDate().toString().padStart(2, '0');
  
  const daysStr = days.toString().padStart(4, '0');
  const schoolSig = (schoolName || "DEMO").substring(0, 4).toUpperCase().padEnd(4, 'X');
  
  const rawKey = `${dateStr}${daysStr}${schoolSig}${ENGINE_CONFIG.IDENTIFIER}${ENGINE_CONFIG.SIG}`;
  return transform(rawKey);
};
