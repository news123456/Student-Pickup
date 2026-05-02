import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  validateLicense,
  activateLicense,
  authenticateSuperadmin,
  setSuperadminPassword,
  getSuperadminPassword,
  generateLicenseKey,
  validateLicenseKeyFormat
} from '../lib/license';

interface LicenseStore {
  isLicenseValid: boolean;
  licenseMessage: string;
  isSuperadminAuthenticated: boolean;
  superadminPassword: string;
  licenseKeyInput: string;
  schoolNameInput: string;
  daysInput: number;
  activationDateInput: string;

  validateLicenseStatus: () => Promise<void>;
  activateLicense: (key: string) => Promise<boolean>;
  authenticateSuperadmin: (password: string) => boolean;
  setSuperadminPassword: (password: string) => void;
  setLicenseKeyInput: (key: string) => void;
  setSchoolNameInput: (name: string) => void;
  setDaysInput: (days: number) => void;
  setActivationDateInput: (date: string) => void;
  generateLicenseKey: () => string;
  logoutSuperadmin: () => void;
}

export const useLicenseStore = create<LicenseStore>()(
  persist(
    (set, get) => ({
      isLicenseValid: false,
      licenseMessage: '',
      isSuperadminAuthenticated: false,
      superadminPassword: getSuperadminPassword(),
      licenseKeyInput: '',
      schoolNameInput: '',
      daysInput: 30,
      activationDateInput: new Date().toISOString().split('T')[0].replace(/-/g, '').slice(0, 8), // DDMMYYYY

      validateLicenseStatus: async () => {
        const result = await validateLicense();
        set({ isLicenseValid: result.valid, licenseMessage: result.message });
      },

      activateLicense: async (key: string) => {
        const success = await activateLicense(key);
        if (success) {
          await get().validateLicenseStatus();
        }
        return success;
      },

      authenticateSuperadmin: (password: string) => {
        const isValid = authenticateSuperadmin(password);
        if (isValid) {
          set({ isSuperadminAuthenticated: true });
        }
        return isValid;
      },

      setSuperadminPassword: (password: string) => {
        setSuperadminPassword(password);
        set({ superadminPassword: password });
      },

      setLicenseKeyInput: (licenseKeyInput) => set({ licenseKeyInput }),
      setSchoolNameInput: (schoolNameInput) => set({ schoolNameInput }),
      setDaysInput: (daysInput) => set({ daysInput }),
      setActivationDateInput: (activationDateInput) => set({ activationDateInput }),

      generateLicenseKey: () => {
        const { schoolNameInput, daysInput, activationDateInput } = get();
        return generateLicenseKey(schoolNameInput, daysInput, activationDateInput);
      },

      logoutSuperadmin: () => set({ isSuperadminAuthenticated: false }),
    }),
    {
      name: 'license-store',
      partialize: (state) => ({
        isSuperadminAuthenticated: false, // Don't persist auth status
        superadminPassword: state.superadminPassword,
      }),
    }
  )
);