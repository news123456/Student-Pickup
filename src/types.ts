export interface Guardian {
  role: 'Father' | 'Mother' | 'Guardian';
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
