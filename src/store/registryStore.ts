import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { RegistryEntry } from '../types';
import { api } from '../services/api';

interface RegistryStore {
  registry: RegistryEntry[];
  isLoaded: boolean;
  setRegistry: (registry: RegistryEntry[]) => void;
  addEntry: (entry: RegistryEntry) => Promise<void>;
  removeEntry: (id: string) => Promise<void>;
  loadRegistry: () => Promise<void>;
}

export const useRegistryStore = create<RegistryStore>()(
  subscribeWithSelector((set, get) => ({
    registry: [],
    isLoaded: false,

    setRegistry: (registry) => set({ registry }),

    addEntry: async (entry) => {
      if (entry.studentFaceDescriptor.length !== 128 || entry.guardians.length === 0) return;
      const newRegistry = [...get().registry, entry];
      set({ registry: newRegistry });
      try {
        await api.registry.save(newRegistry);
      } catch (err) {
        console.error('Registry save failed:', err);
      }
    },

    removeEntry: async (id) => {
      const newRegistry = get().registry.filter((r) => r.id !== id);
      set({ registry: newRegistry });
      try {
        await api.registry.save(newRegistry);
      } catch (err) {
        console.error('Registry delete failed:', err);
      }
    },

    loadRegistry: async () => {
      try {
        const data = await api.registry.get();
        if (Array.isArray(data)) set({ registry: data, isLoaded: true });
      } catch (err) {
        console.error('Registry load failed:', err);
        set({ isLoaded: true });
      }
    },
  }))
);
