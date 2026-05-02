import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Accent, BackupInterval, Theme, SystemSettings } from '../types';
import { api } from '../services/api';

interface SettingsStore {
  theme: Theme;
  accent: Accent;
  backupInterval: BackupInterval;
  lastBackup: number;
  systemSettings: SystemSettings;
  setTheme: (theme: Theme) => void;
  setAccent: (accent: Accent) => void;
  setBackupInterval: (interval: BackupInterval) => void;
  setLastBackup: (time: number) => void;
  setSystemSettings: (settings: SystemSettings) => Promise<void>;
  loadSettings: () => Promise<void>;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      theme: 'dark',
      accent: 'emerald',
      backupInterval: 'off',
      lastBackup: 0,
      systemSettings: { systemPassword: 'admin', backupEnabled: true },

      setTheme: (theme) => set({ theme }),
      setAccent: (accent) => set({ accent }),
      setBackupInterval: (backupInterval) => set({ backupInterval }),
      setLastBackup: (lastBackup) => set({ lastBackup }),

      setSystemSettings: async (systemSettings) => {
        set({ systemSettings });
        try {
          await api.settings.save(systemSettings);
        } catch (err) {
          console.error('Settings save failed:', err);
        }
      },

      loadSettings: async () => {
        try {
          const data = await api.settings.get();
          set({ systemSettings: data });
        } catch (err) {
          console.error('Settings load failed:', err);
        }
      },
    }),
    {
      name: 'sentinel-settings',
      partialize: (s) => ({
        theme: s.theme,
        accent: s.accent,
        backupInterval: s.backupInterval,
        lastBackup: s.lastBackup,
      }),
    }
  )
);
