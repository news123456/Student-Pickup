import { create } from 'zustand';
import type { PickupLog } from '../types';
import { api } from '../services/api';

interface HistoryStore {
  logs: PickupLog[];
  isLoaded: boolean;
  setLogs: (logs: PickupLog[]) => void;
  addLog: (log: PickupLog) => Promise<void>;
  loadHistory: () => Promise<void>;
}

export const useHistoryStore = create<HistoryStore>()((set, get) => ({
  logs: [],
  isLoaded: false,

  setLogs: (logs) => set({ logs }),

  addLog: async (log) => {
    const newLogs = [log, ...get().logs.slice(0, 499)];
    set({ logs: newLogs });
    try {
      await api.history.save(newLogs);
    } catch (err) {
      console.error('History save failed:', err);
    }
  },

  loadHistory: async () => {
    try {
      const data = await api.history.get();
      if (Array.isArray(data)) set({ logs: data, isLoaded: true });
    } catch (err) {
      console.error('History load failed:', err);
      set({ isLoaded: true });
    }
  },
}));
