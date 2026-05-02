import { create } from 'zustand';
import type { LaneState } from '../types';

const defaultLane = (): LaneState => ({
  matchedEntry: null,
  matchStatus: { guardian: false, student: false },
});

interface ScannerStore {
  laneStates: Record<number, LaneState>;
  selectedSlot: number;
  isScanning: boolean;
  availableDevices: MediaDeviceInfo[];
  assignedDevices: Record<number, string>;
  updateLane: (slot: number, state: LaneState) => void;
  resetLane: (slot: number) => void;
  setSelectedSlot: (slot: number) => void;
  setIsScanning: (scanning: boolean) => void;
  setAvailableDevices: (devices: MediaDeviceInfo[]) => void;
  setAssignedDevice: (slot: number, deviceId: string) => void;
}

export const useScannerStore = create<ScannerStore>()((set) => ({
  laneStates: { 1: defaultLane(), 2: defaultLane(), 3: defaultLane() },
  selectedSlot: 1,
  isScanning: false,
  availableDevices: [],
  assignedDevices: {},

  updateLane: (slot, state) =>
    set((prev) => ({ laneStates: { ...prev.laneStates, [slot]: state } })),

  resetLane: (slot) =>
    set((prev) => ({ laneStates: { ...prev.laneStates, [slot]: defaultLane() } })),

  setSelectedSlot: (selectedSlot) => set({ selectedSlot }),
  setIsScanning: (isScanning) => set({ isScanning }),
  setAvailableDevices: (availableDevices) => set({ availableDevices }),
  setAssignedDevice: (slot, deviceId) =>
    set((prev) => ({ assignedDevices: { ...prev.assignedDevices, [slot]: deviceId } })),
}));
