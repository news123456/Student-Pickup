import { useEffect } from 'react';
import { useRegistryStore } from '../store/registryStore';
import { useHistoryStore } from '../store/historyStore';
import { useSettingsStore } from '../store/settingsStore';

export function useInitialize() {
  const loadRegistry = useRegistryStore((s) => s.loadRegistry);
  const loadHistory = useHistoryStore((s) => s.loadHistory);
  const loadSettings = useSettingsStore((s) => s.loadSettings);

  useEffect(() => {
    loadRegistry();
    loadHistory();
    loadSettings();
  }, [loadRegistry, loadHistory, loadSettings]);
}
