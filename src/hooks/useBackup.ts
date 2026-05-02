import { useEffect, useCallback } from 'react';
import { useRegistryStore } from '../store/registryStore';
import { useHistoryStore } from '../store/historyStore';
import { useSettingsStore } from '../store/settingsStore';
import { api } from '../services/api';

export function useBackup() {
  const registry = useRegistryStore((s) => s.registry);
  const logs = useHistoryStore((s) => s.logs);
  const backupInterval = useSettingsStore((s) => s.backupInterval);
  const lastBackup = useSettingsStore((s) => s.lastBackup);
  const setLastBackup = useSettingsStore((s) => s.setLastBackup);
  const setLogs = useHistoryStore((s) => s.setLogs);
  const setRegistry = useRegistryStore((s) => s.setRegistry);

  const exportBackup = useCallback(() => {
    const data = {
      registry,
      history: logs,
      exportedAt: new Date().toISOString(),
      version: '3.0',
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sentinel-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setLastBackup(Date.now());
  }, [registry, logs, setLastBackup]);

  const importBackup = useCallback(
    async (file: File): Promise<boolean> => {
      try {
        const text = await file.text();
        const data = JSON.parse(text) as { registry?: unknown; history?: unknown };
        if (!data.registry || !Array.isArray(data.registry)) return false;

        setRegistry(data.registry as Parameters<typeof setRegistry>[0]);
        await api.registry.save(data.registry as Parameters<typeof api.registry.save>[0]);

        if (data.history && Array.isArray(data.history)) {
          setLogs(data.history as Parameters<typeof setLogs>[0]);
          await api.history.save(data.history as Parameters<typeof api.history.save>[0]);
        }
        return true;
      } catch {
        return false;
      }
    },
    [setRegistry, setLogs]
  );

  // Auto-backup monitor
  useEffect(() => {
    if (backupInterval === 'off' || registry.length === 0) return;
    const threshold = backupInterval === 'daily' ? 86_400_000 : 604_800_000;

    const check = () => {
      if (Date.now() - lastBackup > threshold) exportBackup();
    };

    const id = setInterval(check, 60_000);
    check();
    return () => clearInterval(id);
  }, [backupInterval, lastBackup, registry, exportBackup]);

  return { exportBackup, importBackup };
}
