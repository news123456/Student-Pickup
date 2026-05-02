// Core domain types

export type GuardianRole = 'Father' | 'Mother' | 'Guardian';
export type Accent = 'emerald' | 'blue' | 'purple' | 'amber' | 'rose';
export type BackupInterval = 'off' | 'daily' | 'weekly';
export type Theme = 'light' | 'dark';
export type TabType = 'scan' | 'register' | 'history' | 'admin';

export interface Guardian {
  role: GuardianRole;
  name: string;
  faceDescriptor: number[];
  photo?: string;
}

export interface RegistryEntry {
  id: string;
  childName: string;
  scholarNo: string;
  classSec: string;
  guardians: Guardian[];
  studentFaceDescriptor: number[];
  studentPhoto?: string;
  createdAt: number;
}

export interface PickupLog {
  id: string;
  studentName: string;
  guardianName: string;
  guardianRole: string;
  scholarNo: string;
  classSec: string;
  timestamp: number;
  cameraLabel?: string;
}

export interface SystemSettings {
  systemPassword?: string;
  backupEnabled?: boolean;
}

export interface LaneState {
  matchedEntry: RegistryEntry | null;
  matchStatus: {
    guardian: boolean;
    student: boolean;
    guardianIndex?: number;
  };
  isScanning: boolean;
  scanResult: 'verified' | 'incomplete' | null;
}

export interface DetectionOverlay {
  label: string;
  confidence: number;
  isMatch: boolean;
  box: { x: number; y: number; width: number; height: number };
}

// Worker message types
export type WorkerRequest =
  | { type: 'init_registry'; studentLabels: LabeledDesc[]; guardianLabels: LabeledDesc[] }
  | { type: 'match_batch'; requestId: string; descriptors: number[][] };

export type WorkerResponse =
  | { type: 'ready' }
  | { type: 'batch_result'; requestId: string; matches: WorkerMatch[] };

export interface LabeledDesc {
  id: string;
  descriptors: number[][];
}

export interface WorkerMatch {
  type: 'student' | 'guardian' | 'unknown';
  entryId?: string;
  guardianIndex?: number;
  distance?: number;
}
