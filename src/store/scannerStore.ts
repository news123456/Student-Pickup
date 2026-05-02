import { create } from 'zustand';
import type { LaneState } from '../types';

const defaultLane = (): LaneState => ({
  matchedEntry: null,
  matchStatus: { guardian: false, student: false },
  isScanning: false,
  scanResult: null,
});

interface ScannerStore {
  laneStates: Record<number, LaneState>;
  selectedSlot: number;
  availableDevices: MediaDeviceInfo[];
  assignedDevices: Record<number, string>;
  updateLane: (slot: number, partial: Partial<LaneState>) => void;
  startScanLane: (slot: number) => void;
  stopScanLane: (slot: number, result: 'verified' | 'incomplete') => void;
  resetLane: (slot: number) => void;
  setSelectedSlot: (slot: number) => void;
  setAvailableDevices: (devices: MediaDeviceInfo[]) => void;
  setAssignedDevice: (slot: number, deviceId: string) => void;
}

export const useScannerStore = create<ScannerStore>()((set, get) => ({
  laneStates: { 1: defaultLane(), 2: defaultLane(), 3: defaultLane() },
  selectedSlot: 1,
  availableDevices: [],
  assignedDevices: {},

  updateLane: (slot, partial) =>
    set((prev) => ({
      laneStates: {
        ...prev.laneStates,
        [slot]: { ...prev.laneStates[slot], ...partial },
      },
    })),

  startScanLane: (slot) =>
    set((prev) => ({
      laneStates: {
        ...prev.laneStates,
        [slot]: { ...defaultLane(), isScanning: true },
      },
    })),

  stopScanLane: (slot, result) =>
    set((prev) => ({
      laneStates: {
        ...prev.laneStates,
        [slot]: { ...prev.laneStates[slot], isScanning: false, scanResult: result },
      },
    })),

  resetLane: (slot) =>
    set((prev) => ({ laneStates: { ...prev.laneStates, [slot]: defaultLane() } })),

  setSelectedSlot: (selectedSlot) => set({ selectedSlot }),
  setAvailableDevices: (availableDevices) => set({ availableDevices }),
  setAssignedDevice: (slot, deviceId) =>
    set((prev) => ({ assignedDevices: { ...prev.assignedDevices, [slot]: deviceId } })),
}));
