import { useEffect } from 'react';
import { useRegistryStore } from '../store/registryStore';
import { useHistoryStore } from '../store/historyStore';
import { useSettingsStore } from '../store/settingsStore';
import { useLicenseStore } from '../store/licenseStore';

export function useInitialize() {
  const loadRegistry = useRegistryStore((s) => s.loadRegistry);
  const loadHistory = useHistoryStore((s) => s.loadHistory);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const validateLicenseStatus = useLicenseStore((s) => s.validateLicenseStatus);

  useEffect(() => {
    loadRegistry();
    loadHistory();
    loadSettings();
    validateLicenseStatus();
  }, [loadRegistry, loadHistory, loadSettings, validateLicenseStatus]);
}
