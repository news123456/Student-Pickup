import { create } from 'zustand';
import type { TabType } from '../types';

interface UIStore {
  activeTab: TabType;
  isModelsLoaded: boolean;
  isAdminAuthenticated: boolean;
  isLoginError: boolean;
  setActiveTab: (tab: TabType) => void;
  setModelsLoaded: (loaded: boolean) => void;
  setAdminAuthenticated: (auth: boolean) => void;
  setLoginError: (error: boolean) => void;
}

export const useUIStore = create<UIStore>()((set) => ({
  activeTab: 'scan',
  isModelsLoaded: false,
  isAdminAuthenticated: false,
  isLoginError: false,

  setActiveTab: (activeTab) => set({ activeTab }),
  setModelsLoaded: (isModelsLoaded) => set({ isModelsLoaded }),
  setAdminAuthenticated: (isAdminAuthenticated) => set({ isAdminAuthenticated }),
  setLoginError: (isLoginError) => set({ isLoginError }),
}));
