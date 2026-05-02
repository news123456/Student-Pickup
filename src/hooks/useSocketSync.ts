import { useEffect } from 'react';
import { socketService } from '../services/socket';
import { useRegistryStore } from '../store/registryStore';
import { useHistoryStore } from '../store/historyStore';
import type { RegistryEntry, PickupLog } from '../types';

export function useSocketSync() {
  const setRegistry = useRegistryStore((s) => s.setRegistry);
  const setLogs = useHistoryStore((s) => s.setLogs);

  useEffect(() => {
    socketService.connect();

    const unsubRegistry = socketService.on<RegistryEntry[]>('registry-updated', setRegistry);
    const unsubHistory = socketService.on<PickupLog[]>('history-updated', setLogs);

    return () => {
      unsubRegistry();
      unsubHistory();
    };
  }, [setRegistry, setLogs]);
}
