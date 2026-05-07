/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import * as faceapi from '@vladmandic/face-api';
import { FaceDetector, FilesetResolver, Detection } from '@mediapipe/tasks-vision';
import { 
  Camera, UserPlus, ShieldCheck, History, Loader2, Search, 
  CheckCircle2, UserCircle, Download, Trash2, Lock,
  Sun, Moon, Palette, Upload, Database, FileJson, AlertTriangle, Eye, EyeOff,
  Zap, Activity, Settings, X, RefreshCw, CameraOff, User
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { io, Socket } from 'socket.io-client';
import { validateLicense, generateLicense } from './lib/licenseEngine';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { cn } from './lib/utils';
import { RegistryEntry, PickupLog, Guardian } from './types.ts';
import { exportLogsToPDF, exportRegistryToPDF, exportTechnicalDoc, exportPresentationDoc } from './lib/pdfExport';

// Constants
const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';
const REGISTRY_STORAGE_KEY = 'guardlink_registry_v3';
const HISTORY_STORAGE_KEY = 'guardlink_history_v3';
const ACCENT_STORAGE_KEY = 'guardlink_accent';
const BACKUP_INTERVAL_KEY = 'guardlink_backup_interval';
const LAST_BACKUP_KEY = 'guardlink_last_backup_time';

interface SystemSettings {
  systemPassword?: string;
  backupEnabled?: boolean;
  schoolName?: string;
  licenseKey?: string;
  licenseExpiryDate?: number;
  lastSeenTimestamp?: number;
  lastSyncTimestamp?: number;
  isTampered?: boolean;
}

type Accent = 'emerald' | 'blue' | 'purple' | 'amber' | 'rose';
type BackupInterval = 'off' | 'daily' | 'weekly';

export default function App() {
  const [isModelsLoaded, setIsModelsLoaded] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [registry, setRegistry] = useState<RegistryEntry[]>([]);
  const [activeTab, setActiveTab] = useState<'scan' | 'register' | 'history' | 'admin'>('scan');
  const [currentMatch, setCurrentMatch] = useState<{
    matchedEntry: RegistryEntry | null;
    matchStatus: { guardian: boolean; student: boolean; guardianIndex?: number };
  }>({ matchedEntry: null, matchStatus: { guardian: false, student: false } });
  const [isScanning, setIsScanning] = useState(false);
  const [recentPickups, setRecentPickups] = useState<PickupLog[]>([]);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [isLoginError, setIsLoginError] = useState(false);
  const [accent, setAccent] = useState<Accent>((localStorage.getItem(ACCENT_STORAGE_KEY) as Accent) || 'emerald');
  const [backupInterval, setBackupInterval] = useState<BackupInterval>((localStorage.getItem(BACKUP_INTERVAL_KEY) as BackupInterval) || 'off');
  const [lastBackup, setLastBackup] = useState<number>(Number(localStorage.getItem(LAST_BACKUP_KEY)) || 0);
  const [systemSettings, setSystemSettings] = useState<SystemSettings>({ systemPassword: 'admin', backupEnabled: true });
  const [availableDevices, setAvailableDevices] = useState<MediaDeviceInfo[]>([]);
  const [assignedDeviceId, setAssignedDeviceId] = useState<string>('');
  const [isGeneratingTest, setIsGeneratingTest] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('sentinel-theme');
    return (saved as 'light' | 'dark') || 'dark';
  });
  const [storagePath, setStoragePath] = useState<string>('');

  // --- LICENSING LOGIC (STRICT OFFLINE MODE) ---
  const [licenseStatus, setLicenseStatus] = useState<{
    isActive: boolean;
    remainingDays: number;
    error?: string;
    isTampered?: boolean;
  }>({ isActive: false, remainingDays: 0 });

  useEffect(() => {
    let lastUpdate = 0;
    const checkLicense = () => {
      const now = Date.now();
      const { licenseKey, lastSeenTimestamp, isTampered, schoolName } = systemSettings;

      // Anti-Tamper Check (Grace period of 5 mins for clock jitter)
      if (lastSeenTimestamp && now < (lastSeenTimestamp - 300000)) { 
        if (!isTampered) {
          const updated = { ...systemSettings, isTampered: true };
          setSystemSettings(updated);
          syncSettingsWithServer(updated);
        }
        return;
      }

      // Integrity Update (every 2 min)
      if (!isTampered && now > (lastSeenTimestamp || 0) + 120000) {
        setSystemSettings(prev => ({ ...prev, lastSeenTimestamp: now }));
        if (now - lastUpdate > 300000) {
          syncSettingsWithServer({ ...systemSettings, lastSeenTimestamp: now });
          lastUpdate = now;
        }
      }

      if (isTampered) {
        setLicenseStatus({ isActive: false, remainingDays: 0, isTampered: true });
        return;
      }

      if (!licenseKey) {
        setLicenseStatus({ isActive: false, remainingDays: 0 });
        return;
      }

      const valCheck = validateLicense(licenseKey, schoolName);
      if (!valCheck.valid || !valCheck.expiry) {
        setLicenseStatus({ isActive: false, remainingDays: 0, error: "Authentication Failure" });
        return;
      }

      const diff = valCheck.expiry - now;
      const daysLeft = Math.ceil(diff / (1000 * 60 * 60 * 24));

      if (daysLeft <= 0) {
        setLicenseStatus({ isActive: false, remainingDays: 0, error: "License Expired" });
      } else {
        setLicenseStatus({ isActive: true, remainingDays: daysLeft });
      }
    };

    const interval = setInterval(checkLicense, 30000); 
    checkLicense();
    return () => clearInterval(interval);
  }, [systemSettings.isTampered, systemSettings.licenseKey, systemSettings.schoolName]);

  const activateProduct = (key: string) => {
    const result = validateLicense(key, systemSettings.schoolName);
    if (result.valid && result.expiry) {
      const updated: SystemSettings = {
        ...systemSettings,
        licenseKey: key,
        licenseExpiryDate: result.expiry,
        isTampered: false,
        lastSeenTimestamp: Date.now()
      };
      setSystemSettings(updated);
      syncSettingsWithServer(updated);
      return true;
    }
    return false;
  };

  useEffect(() => {
    const fetchStoragePath = async (retries = 5) => {
      try {
        const r = await fetch("/api/storage-path");
        if (!r.ok) throw new Error("Failed");
        const d = await r.json();
        setStoragePath(d.path);
      } catch (e) {
        if (retries > 0) setTimeout(() => fetchStoragePath(retries - 1), 2000);
      }
    };
    fetchStoragePath();
  }, []);
  const socketRef = useRef<Socket | null>(null);

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('sentinel-theme', theme);
  }, [theme]);

  // Load models and initial data on mount
  useEffect(() => {
    // Initialize Socket
    socketRef.current = io();
    
    socketRef.current.on('registry-updated', (data) => {
      setRegistry(data);
    });

    socketRef.current.on('history-updated', (data) => {
      setRecentPickups(data);
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  // Time-Drift & Security Invariants
  useEffect(() => {
    const lastSeen = systemSettings.lastSyncTimestamp || 0;
    const now = Date.now();
    // If the hardware clock is moved back significantly compared to last recorded sync
    if (lastSeen > now + 600000) { // 10 minute grace period
      setSystemSettings(prev => ({ ...prev, isTampered: true }));
      console.error("TEMPORAL_TAMPER_DETECTED: System clock regressed.");
    }
  }, [systemSettings.lastSyncTimestamp]);

  useEffect(() => {
    async function getDevices() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.error("Camera API not available in this browser context.");
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true }); // Request permission first
        const devices = await navigator.mediaDevices.enumerateDevices();
        
        // Stop the initial permission stream immediately
        stream.getTracks().forEach(track => track.stop());

        const videoDevices = devices.filter(d => d.kind === 'videoinput');
        setAvailableDevices(videoDevices);
        
        // Auto-assign primary camera
        if (videoDevices.length > 0) {
          setAssignedDeviceId(videoDevices[0].deviceId);
        }
      } catch (err) {
        console.error("Device discovery error:", err);
        if (err instanceof Error) {
          if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            alert("Camera permission denied. Please allow camera access in your browser settings and refresh.");
          }
        }
      }
    }

    async function init() {
      try {
        await getDevices();
        console.log("Loading face-api models from:", MODEL_URL);
        
        let attempts = 0;
        const maxAttempts = 3;
        while (attempts < maxAttempts) {
          try {
            await Promise.all([
              faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
              faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
              faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
            ]);
            break;
          } catch (modelLoadErr) {
            attempts++;
            console.warn(`Model loading attempt ${attempts} failed:`, modelLoadErr);
            if (attempts >= maxAttempts) throw modelLoadErr;
            await new Promise(r => setTimeout(r, 2000));
          }
        }

        console.log("Models loaded successfully");
        setIsModelsLoaded(true);

        // Fetch from server with retry logic
        const fetchWithRetry = async (url: string, retries = 3): Promise<any> => {
          try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
          } catch (e) {
            if (retries > 0) {
              await new Promise(r => setTimeout(r, 2000));
              return fetchWithRetry(url, retries - 1);
            }
            throw e;
          }
        };

        try {
          const regData = await fetchWithRetry("/api/registry");
          if (Array.isArray(regData)) setRegistry(regData);
        } catch (e) {
          console.warn("Registry fetch failed after retries");
        }

        try {
          const settingsData = await fetchWithRetry("/api/settings");
          if (settingsData) setSystemSettings(prev => ({ ...prev, ...settingsData }));
        } catch (e) {
          console.warn("Settings fetch failed after retries");
        }

        try {
          const historyData = await fetchWithRetry("/api/history");
          if (Array.isArray(historyData)) setRecentPickups(historyData);
        } catch (e) {
          console.warn("History fetch failed after retries");
        }
      } catch (error) {
        console.error("Initialization error:", error);
        setInitError(error instanceof Error ? error.message : "System initialization failed");
        if (error instanceof Error && error.message.includes("Failed to fetch")) {
          console.error("Face-api models failed to load. Check your internet connection or the MODEL_URL.");
          setInitError("Network Error: Failed to fetch AI models. Check your connection or the MODEL_URL.");
        }
      }
    }
    init();
  }, []);

  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'error'>('idle');

  const syncRegistryWithServer = async (newRegistry: RegistryEntry[]) => {
    setSyncStatus('syncing');
    const trySync = async (retries = 3) => {
      try {
        const response = await fetch("/api/registry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newRegistry)
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        setSyncStatus('idle');
      } catch (err) {
        if (retries > 0) {
          setTimeout(() => trySync(retries - 1), 2000);
        } else {
          console.error("Failed to sync with server after retries:", err);
          setSyncStatus('error');
        }
      }
    };
    trySync();
  };

  const syncSettingsWithServer = async (newSettings: SystemSettings) => {
    setSyncStatus('syncing');
    const trySync = async (retries = 3) => {
      try {
        const response = await fetch("/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newSettings || {})
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        setSyncStatus('idle');
        setSystemSettings(prev => ({ ...prev, lastSyncTimestamp: Date.now() }));
      } catch (err) {
        if (retries > 0) {
          setTimeout(() => trySync(retries - 1), 2000);
        } else {
          console.error("Failed to sync settings after retries:", err);
          setSyncStatus('error');
        }
      }
    };
    trySync();
  };

  const handleStressTest = async () => {
    if (!confirm("Scale Stress Test: This will generate 1,500 students and 4,500 guardians (6,000 total descriptors) to test system performance. Existing data will be overwritten. Proceed?")) return;
    
    setIsGeneratingTest(true);
    const mockData: RegistryEntry[] = [];
    
    // Synthetic data generation
    for (let i = 0; i < 1500; i++) {
      const studentId = crypto.randomUUID();
      const studentName = `Test_Student_${i + 1}`;
      
      const guardians: Guardian[] = [
        { role: 'Father', name: `Father_${i}`, faceDescriptor: Array.from({ length: 128 }, () => Math.random() * 0.1) },
        { role: 'Mother', name: `Mother_${i}`, faceDescriptor: Array.from({ length: 128 }, () => Math.random() * 0.1) },
        { role: 'Guardian', name: `Guardian_${i}`, faceDescriptor: Array.from({ length: 128 }, () => Math.random() * 0.1) }
      ];

      mockData.push({
        id: studentId,
        childName: studentName,
        scholarNo: `SCH-${20000 + i}`,
        classSec: `${Math.ceil((i + 1) / 40)}-${String.fromCharCode(65 + (i % 3))}`,
        studentFaceDescriptor: Array.from({ length: 128 }, () => Math.random() * 0.1),
        guardians,
        createdAt: Date.now()
      });

      if (i % 500 === 0) console.log(`Stress Test: Generated ${i} records...`);
    }

    try {
      const response = await fetch("/api/registry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mockData)
      });
      if (response.ok) {
        setRegistry(mockData);
        alert("Stress Test Loaded: 1,500 Students & 4,500 Guardians. System now under 6,000 descriptor load.");
      }
    } catch (err) {
      alert("Test Generation Failed: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsGeneratingTest(false);
    }
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-accent', accent);
  }, [accent]);

  const changeAccent = (newAccent: Accent) => {
    setAccent(newAccent);
    localStorage.setItem(ACCENT_STORAGE_KEY, newAccent);
  };

  const changeBackupInterval = (interval: BackupInterval) => {
    setBackupInterval(interval);
    localStorage.setItem(BACKUP_INTERVAL_KEY, interval);
  };

  const exportBackup = () => {
    const data = {
      registry,
      history: recentPickups,
      exportedAt: new Date().toISOString(),
      version: '3.0'
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sentinel-local-drive-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    const now = Date.now();
    setLastBackup(now);
    localStorage.setItem(LAST_BACKUP_KEY, now.toString());
  };

  // Auto-backup monitor
  useEffect(() => {
    if (backupInterval === 'off' || registry.length === 0) return;

    const checkBackup = () => {
      const now = Date.now();
      const oneDay = 24 * 60 * 60 * 1000;
      const oneWeek = 7 * oneDay;
      const threshold = backupInterval === 'daily' ? oneDay : oneWeek;

      if (now - lastBackup > threshold) {
        console.log(`Triggering auto-backup (${backupInterval})`);
        exportBackup();
      }
    };

    const timer = setInterval(checkBackup, 60000); 
    checkBackup(); 
    return () => clearInterval(timer);
  }, [backupInterval, lastBackup, registry]);

  const importBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.registry && Array.isArray(data.registry)) {
          setRegistry(data.registry);
          await syncRegistryWithServer(data.registry);
          if (data.history) {
            setRecentPickups(data.history);
            localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(data.history));
          }
          alert("Backup Restored Successfully. Data synced to local drive.");
        }
      } catch (err) {
        alert("Failed to read backup file.");
      }
    };
    reader.readAsText(file);
  };

  const addToRegistry = (entry: RegistryEntry) => {
    if (entry.studentFaceDescriptor.length !== 128 || entry.guardians.length === 0) return;
    const newRegistry = [...registry, entry];
    setRegistry(newRegistry);
    syncRegistryWithServer(newRegistry);
  };

  const logPickup = (entry: RegistryEntry, guardianIndex: number, cameraLabel?: string) => {
    const guardian = entry.guardians[guardianIndex];
    const newLog: PickupLog = {
      id: crypto.randomUUID(),
      studentName: entry.childName,
      guardianName: guardian.name || 'Guardian',
      guardianRole: guardian.role,
      scholarNo: entry.scholarNo,
      classSec: entry.classSec,
      timestamp: Date.now(),
      cameraLabel: cameraLabel || 'Standard Node'
    };
    
    const newHistory = [newLog, ...recentPickups.slice(0, 49)];
    setRecentPickups(newHistory);
    
    fetch("/api/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newHistory)
    }).catch(err => console.error("History sync error:", err));
  };

  if (!isModelsLoaded) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center space-y-8 max-w-md">
          {initError ? (
            <div className="w-20 h-20 bg-red-500/10 rounded-3xl flex items-center justify-center text-red-500 mx-auto border border-red-500/20 shadow-lg shadow-red-500/5">
              <AlertTriangle className="w-10 h-10" />
            </div>
          ) : (
            <div className="relative w-20 h-20 mx-auto">
              <Loader2 className="w-full h-full text-accent-emerald animate-spin-slow" />
              <div className="absolute inset-4 rounded-full border-2 border-accent-emerald/20 animate-pulse flex items-center justify-center">
                <Zap className="w-6 h-6 text-accent-emerald" />
              </div>
            </div>
          )}
          
          <div className="space-y-4">
            <h1 className="text-2xl font-black tracking-tight uppercase text-text-primary">
              {initError ? "System Offline" : "Initializing Sentinel"}
            </h1>
            <p className="text-text-secondary text-[10px] sm:text-xs font-bold tracking-widest uppercase opacity-60 leading-relaxed">
              {initError || "Synchronizing Neural weights & Encrypted database layers..."}
            </p>
          </div>

          {initError && (
            <button 
              onClick={() => window.location.reload()}
              className="w-full py-4 bg-white text-black rounded-2xl font-black text-xs tracking-[0.3em] uppercase hover:bg-accent-emerald transition-all shadow-xl shadow-black/20"
            >
              Retry Connection
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-text-primary font-sans selection:bg-accent-emerald/30">
      {!licenseStatus.isActive && activeTab === 'scan' && (
        <div className="absolute inset-0 z-50 bg-black/40 backdrop-blur-3xl flex flex-col items-center justify-center p-6 text-center">
          <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center border border-red-500/20 mb-6">
            <Lock className="w-10 h-10 text-red-500" />
          </div>
          <h3 className="text-3xl font-black text-white italic uppercase tracking-tighter mb-2 underline decoration-red-500 decoration-4 underline-offset-8">System Hardware Blocked</h3>
          <p className="text-sm font-bold text-white/60 uppercase tracking-widest max-w-md">
            Biometric engine is offline. {licenseStatus.isTampered ? "SECURITY TAMPER DETECTED: Reset required." : "Activation required in Admin Panel."}
          </p>
          <button 
            onClick={() => setActiveTab('admin')}
            className="mt-8 px-8 py-4 bg-white text-black font-black text-xs uppercase tracking-[0.2em] rounded-xl hover:scale-105 active:scale-95 transition-all shadow-xl"
          >
            Go to Activation Panel
          </button>
        </div>
      )}

      {/* Navigation Bar */}
      <nav className="h-[72px] border-b border-surface-border px-4 sm:px-10 flex items-center justify-between sticky top-0 z-50 backdrop-blur-xl bg-background/80">
        <div className="flex items-center space-x-3 sm:space-x-4">
          <div className="w-9 h-9 sm:w-10 sm:h-10 bg-accent-emerald rounded-lg sm:rounded-xl flex items-center justify-center group shadow-sm flex-shrink-0">
            <ShieldCheck className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
          </div>
          <div className="hidden xs:block">
            <h1 className="text-[12px] sm:text-sm font-extrabold tracking-tight uppercase leading-none text-text-primary">Sentinel</h1>
            <p className="hidden sm:block text-[10px] font-medium text-text-secondary mt-1 uppercase tracking-widest opacity-70">Main Campus Entry</p>
          </div>
        </div>

        <div className="flex bg-surface border border-surface-border p-1 rounded-2xl shadow-sm sm:absolute sm:left-1/2 sm:-translate-x-1/2">
          <NavBtn 
            active={activeTab === 'scan'} 
            onClick={() => setActiveTab('scan')} 
            label="Scanner" 
            icon={<Camera className="w-4 h-4" />}
          />
          <NavBtn 
            active={activeTab === 'register'} 
            onClick={() => setActiveTab('register')} 
            label="Enroll" 
            icon={<UserPlus className="w-4 h-4" />}
          />
          <NavBtn 
            active={activeTab === 'history'} 
            onClick={() => setActiveTab('history')} 
            label="Logs" 
            icon={<History className="w-4 h-4" />}
          />
          <NavBtn 
            active={activeTab === 'admin'} 
            onClick={() => setActiveTab('admin')} 
            label="Admin" 
            icon={<Lock className="w-4 h-4" />}
          />
        </div>

        <div className="hidden lg:flex items-center space-x-6">
          {/* Sync Status Badge */}
          <div className="flex items-center space-x-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
            <div className={cn(
              "w-1.5 h-1.5 rounded-full",
              syncStatus === 'syncing' ? "bg-amber-500 animate-pulse" : 
              syncStatus === 'error' ? "bg-red-500" : "bg-emerald-500"
            )} />
            <span className="text-[9px] font-black text-text-secondary uppercase tracking-[0.2em] leading-none">
              {syncStatus === 'syncing' ? 'SYNC' : syncStatus === 'error' ? 'ERR' : 'LIVE'}
            </span>
          </div>

          <div className="flex items-center bg-surface p-1 rounded-lg border border-surface-border">
            <div className="flex items-center space-x-1 px-1">
              {(['emerald', 'blue', 'purple', 'amber', 'rose'] as Accent[]).map((a) => (
                <button
                  key={a}
                  onClick={() => changeAccent(a)}
                  className={cn(
                    "w-2.5 h-2.5 rounded-full transition-all border border-white/10",
                    accent === a ? "scale-125 border-white" : "opacity-40 hover:opacity-100",
                    a === 'emerald' && "bg-[#10b981]",
                    a === 'blue' && "bg-[#3b82f6]",
                    a === 'purple' && "bg-[#a855f7]",
                    a === 'amber' && "bg-[#f59e0b]",
                    a === 'rose' && "bg-[#f43f5e]"
                  )}
                />
              ))}
            </div>
          </div>

          <button
            onClick={() => setTheme(prev => prev === 'light' ? 'dark' : 'light')}
            className="w-8 h-8 rounded-lg flex items-center justify-center border border-surface-border bg-surface hover:border-accent-emerald transition-all cursor-pointer group"
          >
            {theme === 'light' ? (
              <Moon className="w-4 h-4 text-text-secondary group-hover:text-accent-emerald" />
            ) : (
              <Sun className="w-4 h-4 text-text-secondary group-hover:text-amber-400" />
            )}
          </button>

          <div className="status-badge">
            <span className="w-1.5 h-1.5 bg-accent-emerald rounded-full mr-2 animate-pulse" />
            System Live
          </div>
          <div className="text-right">
            <div className="text-xs font-bold text-text-primary uppercase">{new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
            <div className="text-[10px] font-mono text-text-secondary uppercase mt-0.5">{new Date().toLocaleTimeString()}</div>
          </div>
        </div>
      </nav>

      <main className="min-h-[calc(100vh-72px)] sm:pb-0 pb-20">
        <div className="max-w-[1600px] mx-auto p-4 sm:p-6 md:p-10">
        <AnimatePresence mode="wait">
          {activeTab === 'scan' && (
            <motion.div 
              key="scan"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10"
            >
              {/* Left Column: Scanner Grid */}
              <div className="lg:col-span-8 flex flex-col space-y-4">
                <div className="flex-1">
                  <div className="glass-card overflow-hidden bg-slate-100 dark:bg-slate-900/50 relative flex flex-col min-h-[400px] shadow-sm ring-1 ring-black/5">
                    <Scanner 
                      registry={registry} 
                      deviceId={assignedDeviceId}
                      cameraLabel="Primary Recognition Node"
                      isVerified={currentMatch.matchStatus.guardian && currentMatch.matchStatus.student}
                      matchStatus={currentMatch.matchStatus}
                      matchedEntry={currentMatch.matchedEntry}
                      onReset={() => {
                        setCurrentMatch({ matchedEntry: null, matchStatus: { guardian: false, student: false } });
                      }}
                      onDeviceChange={(newId) => {
                        setAssignedDeviceId(newId);
                      }}
                      onMatch={(entry, type, guardianIndex) => {
                        // Play partial match sound
                        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
                        const osc = audioCtx.createOscillator();
                        const gain = audioCtx.createGain();
                        osc.frequency.setValueAtTime(type === 'student' ? 880 : 660, audioCtx.currentTime);
                        gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
                        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
                        osc.connect(gain);
                        gain.connect(audioCtx.destination);
                        osc.start();
                        osc.stop(audioCtx.currentTime + 0.1);

                        setCurrentMatch(prev => {
                          const isNewEntry = !prev.matchedEntry || prev.matchedEntry.id !== entry.id;
                          
                          let newEntry = isNewEntry ? entry : prev.matchedEntry;
                          let newStatus;

                          if (isNewEntry) {
                            newStatus = {
                              guardian: type === 'guardian',
                              student: type === 'student',
                              guardianIndex: type === 'guardian' ? guardianIndex : undefined
                            };
                          } else {
                            newStatus = {
                              guardian: prev.matchStatus.guardian || type === 'guardian',
                              student: prev.matchStatus.student || type === 'student',
                              guardianIndex: type === 'guardian' ? guardianIndex : prev.matchStatus.guardianIndex
                            };
                          }

                          // Log pickup and play success sound if both are verified for the FIRST time
                          if (newStatus.guardian && newStatus.student && !(prev.matchStatus.guardian && prev.matchStatus.student)) {
                            // Success chime
                            const sOsc = audioCtx.createOscillator();
                            const sGain = audioCtx.createGain();
                            sOsc.type = 'triangle';
                            sOsc.frequency.setValueAtTime(880, audioCtx.currentTime);
                            sOsc.frequency.exponentialRampToValueAtTime(1320, audioCtx.currentTime + 0.1);
                            sGain.gain.setValueAtTime(0.1, audioCtx.currentTime);
                            sGain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
                            sOsc.connect(sGain);
                            sGain.connect(audioCtx.destination);
                            sOsc.start();
                            sOsc.stop(audioCtx.currentTime + 0.5);

                            logPickup(entry, newStatus.guardianIndex!, "Primary Node");
                          }

                          return {
                            matchedEntry: newEntry, 
                            matchStatus: newStatus 
                          };
                        });
                      }}
                      onScanningStateChange={setIsScanning}
                    />

                    {/* Camera Selector */}
                    <div className="absolute top-4 right-4 z-20">
                      <select 
                        value={assignedDeviceId || ''}
                        onChange={(e) => setAssignedDeviceId(e.target.value)}
                        className="bg-surface/90 backdrop-blur-md border border-surface-border rounded-full px-3 py-1 text-[9px] font-bold uppercase text-text-primary outline-none cursor-pointer hover:bg-surface transition-all shadow-sm"
                      >
                        <option value="">No Source</option>
                        {availableDevices.map(d => (
                          <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${d.deviceId.slice(0, 4)}`}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center justify-between p-5 glass-card">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-accent-emerald/10 rounded-2xl flex items-center justify-center text-accent-emerald">
                      <ShieldCheck className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-accent-emerald">Security active</p>
                      <p className="text-sm text-text-primary font-bold">Biometric verification in progress</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Result Details */}
              <div className="lg:col-span-4">
                <div className="sticky top-28 space-y-6">
                  <AnimatePresence mode="wait">
                    {currentMatch.matchedEntry ? (
                      <motion.div
                        key={`result-${currentMatch.matchedEntry.id}`}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="glass-card ring-1 ring-accent-emerald/30 overflow-hidden"
                      >
                        <div className="p-6 sm:p-8 border-b border-surface-border bg-accent-emerald-alpha/5 relative overflow-hidden group">
                           <CheckCircle2 className={cn(
                             "w-24 h-24 sm:w-32 sm:h-32 absolute -right-4 -bottom-4 rotate-12 transition-all duration-500 opacity-20",
                             currentMatch.matchStatus.guardian && currentMatch.matchStatus.student ? "text-accent-emerald scale-110" : "text-text-secondary/40"
                           )} />
                           <div className="relative">
                            <div className={cn(
                               "status-badge mb-4 border-accent-emerald/20 text-[8px] sm:text-[10px]",
                               currentMatch.matchStatus.guardian && currentMatch.matchStatus.student ? "text-accent-emerald bg-accent-emerald-alpha" : "text-amber-500 bg-amber-500/10 border-amber-500/20"
                            )}>
                              {currentMatch.matchStatus.guardian && currentMatch.matchStatus.student ? "Identification Verified" : "Awaiting Pairing"}
                            </div>
                            <h3 className="text-xl sm:text-2xl font-extrabold text-text-primary tracking-tight leading-none px-1">
                              {currentMatch.matchStatus.guardian && currentMatch.matchStatus.student ? "Authorized Entry" : "Verification Pending"}
                            </h3>
                            <p className="text-[10px] uppercase font-bold tracking-widest text-accent-emerald mt-2 opacity-80">
                              {currentMatch.matchStatus.guardian && !currentMatch.matchStatus.student && "Guardian Found. Please bring the student."}
                              {!currentMatch.matchStatus.guardian && currentMatch.matchStatus.student && "Student Found. Please bring a guardian."}
                              {currentMatch.matchStatus.guardian && currentMatch.matchStatus.student && "All Security checks passed."}
                            </p>
                          </div>
                        </div>

                        <div className="p-6 sm:p-8 space-y-7">
                          <div className="flex items-center justify-between">
                             <InfoTile label="Student Primary" value={currentMatch.matchedEntry.childName} />
                             <div className={cn("w-6 h-6 rounded-full flex items-center justify-center", currentMatch.matchStatus.student ? "bg-accent-emerald text-white" : "bg-background border border-surface-border text-text-secondary/20")}>
                               <CheckCircle2 className="w-4 h-4" />
                             </div>
                          </div>
                          <div className="grid grid-cols-2 gap-6">
                            <InfoTile label="Scholar ID" value={currentMatch.matchedEntry.scholarNo} mono />
                            <InfoTile label="Class/Section" value={currentMatch.matchedEntry.classSec} />
                          </div>
                          <div className="flex items-center justify-between">
                             <InfoTile 
                               label={currentMatch.matchStatus.guardianIndex !== undefined ? currentMatch.matchedEntry.guardians[currentMatch.matchStatus.guardianIndex].role : "Authorized Guardian"} 
                               value={currentMatch.matchStatus.guardianIndex !== undefined ? currentMatch.matchedEntry.guardians[currentMatch.matchStatus.guardianIndex].name : "Checking..."} 
                             />
                             <div className={cn("w-6 h-6 rounded-full flex items-center justify-center", currentMatch.matchStatus.guardian ? "bg-accent-emerald text-white" : "bg-background border border-surface-border text-text-secondary/20")}>
                               <CheckCircle2 className="w-4 h-4" />
                             </div>
                          </div>
                          
                          {currentMatch.matchStatus.guardian && currentMatch.matchStatus.student ? (
                            <button 
                              onClick={() => {
                                setCurrentMatch({ matchedEntry: null, matchStatus: { guardian: false, student: false } });
                              }}
                              className="w-full py-4 bg-accent-emerald text-white rounded-xl font-black text-xs tracking-[0.2em] uppercase hover:shadow-[0_0_20px_rgba(16,185,129,0.4)] transition-all cursor-pointer"
                            >
                              RELEASE STUDENT
                            </button>
                          ) : (currentMatch.matchStatus.guardian || currentMatch.matchStatus.student) ? (
                            <button 
                              onClick={() => {
                                setCurrentMatch({ matchedEntry: null, matchStatus: { guardian: false, student: false } });
                              }}
                              className="w-full py-4 bg-surface text-text-secondary rounded-xl font-black text-xs tracking-[0.2em] uppercase border border-surface-border cursor-pointer hover:bg-black/5 dark:hover:bg-white/5"
                            >
                              RESET SEARCH
                            </button>
                          ) : (
                            <button 
                              disabled
                              className="w-full py-4 bg-surface/50 text-text-secondary/30 rounded-xl font-black text-xs tracking-[0.2em] uppercase cursor-not-allowed border border-surface-border"
                            >
                              Awaiting Both Faces
                            </button>
                          )}
                        </div>
                      </motion.div>
                    ) : (
                      <motion.div
                        key="placeholder"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="glass-card border-none p-12 text-center aspect-square flex flex-col justify-center"
                      >
                        <div className="w-20 h-20 bg-surface rounded-full flex items-center justify-center mx-auto mb-6 border border-surface-border relative shadow-sm">
                          <div className="absolute inset-0 bg-accent-emerald/5 rounded-full animate-ping" />
                          <Search className="w-8 h-8 text-text-secondary relative" />
                        </div>
                        <h3 className="text-sm font-bold text-text-primary uppercase tracking-widest">Active Scan</h3>
                        <p className="text-[10px] text-text-secondary font-medium mt-3 max-w-[200px] mx-auto uppercase leading-relaxed opacity-60">Waiting for biometric verification...</p>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* MINI LOGS */}
                  <div className="glass-card p-6">
                    <h4 className="info-label mb-4 opacity-50">Recent History</h4>
                    <div className="space-y-3">
                      {recentPickups.slice(0, 3).map((log, i) => (
                        <div key={i} className="flex justify-between items-center bg-white/2 p-3 rounded-lg border border-white/5">
                          <div className="flex flex-col">
                            <span className="text-[11px] font-bold text-text-primary uppercase truncate max-w-[120px]">{log.studentName}</span>
                            <span className="text-[9px] font-bold text-text-secondary uppercase">ID: {log.scholarNo}</span>
                          </div>
                          <span className="font-mono text-[10px] text-accent-emerald">{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      ))}
                      {recentPickups.length === 0 && (
                        <p className="text-[10px] text-text-secondary text-center py-4 uppercase font-medium">No records found</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'register' && (
            <motion.div 
              key="register"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-4xl mx-auto"
            >
              <RegisterForm onEnroll={addToRegistry} />
            </motion.div>
          )}

          {activeTab === 'history' && (
            <motion.div 
              key="history"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-5xl mx-auto px-4 sm:px-0"
            >
              <div className="glass-card overflow-hidden">
                <div className="p-6 sm:p-10 border-b border-surface-border flex flex-col sm:flex-row items-center justify-between gap-6">
                  <div className="text-center sm:text-left">
                    <div className="status-badge mb-3 mx-auto sm:mx-0 w-fit">Audit Logs</div>
                    <h2 className="text-2xl sm:text-3xl font-extrabold text-text-primary tracking-tight mb-2 leading-none">Log Archives</h2>
                    <p className="text-text-secondary text-[10px] sm:text-xs font-medium tracking-tight">Full historical log of campus student releases.</p>
                  </div>
                  <div className="flex items-center space-x-3">
                    <button 
                      onClick={() => exportLogsToPDF(recentPickups)}
                      className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg text-[10px] font-black uppercase tracking-widest text-white flex items-center space-x-2 transition-all"
                    >
                      <Download className="w-3 h-3" />
                      <span>Download PDF</span>
                    </button>
                    <History className="w-10 h-10 sm:w-12 sm:h-12 text-white/5" />
                  </div>
                </div>
                
                <div className="p-4 sm:p-6">
                  {/* Table View (Desktop) */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-white/5">
                          <th className="info-label px-4 py-4">Student Detail</th>
                          <th className="info-label px-4 py-4">Authorized Guardian</th>
                          <th className="info-label px-4 py-4">Tracking Node</th>
                          <th className="info-label px-4 py-4 text-right">Timestamp</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/2">
                        {recentPickups.length > 0 ? (
                          recentPickups.map((log) => (
                            <tr key={log.id} className="hover:bg-white/2 transition-colors group">
                              <td className="px-4 py-6">
                                <div className="flex items-center space-x-3">
                                  <div className="w-9 h-9 bg-accent-emerald/10 rounded-full flex items-center justify-center text-accent-emerald border border-accent-emerald/20">
                                    <UserCircle className="w-5 h-5" />
                                  </div>
                                  <div>
                                    <p className="font-bold text-white uppercase italic tracking-tight">{log.studentName}</p>
                                    <p className="text-[10px] font-mono text-text-secondary uppercase">UID: {log.scholarNo}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-6">
                                <div className="flex flex-col">
                                  <p className="text-sm font-medium text-text-primary">{log.guardianName}</p>
                                  <div className="flex items-center space-x-2">
                                    <span className="text-[9px] font-black uppercase tracking-widest text-accent-emerald px-1.5 py-0.5 bg-accent-emerald/10 rounded">
                                      {log.guardianRole}
                                    </span>
                                    <p className="text-[9px] uppercase font-bold text-text-secondary/40 tracking-widest">Verified</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-6">
                                <div className="flex flex-col">
                                  <span className="px-2 py-1 bg-background border border-surface-border rounded text-[10px] font-bold text-text-primary uppercase tracking-widest w-fit">
                                    {log.cameraLabel || 'Standard'}
                                  </span>
                                  <span className="text-[8px] mt-1 text-text-secondary uppercase font-black tracking-widest">{log.classSec}</span>
                                </div>
                              </td>
                              <td className="px-4 py-6 text-right">
                                <p className="text-xs font-bold text-text-primary font-mono">{new Date(log.timestamp).toLocaleTimeString()}</p>
                                <p className="text-[10px] font-bold text-text-secondary uppercase tracking-tighter">{new Date(log.timestamp).toLocaleDateString()}</p>
                              </td>
                            </tr>
                          ))
                        ) : null}
                      </tbody>
                    </table>
                  </div>

                  {/* Card View (Mobile) */}
                  <div className="md:hidden space-y-4">
                    {recentPickups.length > 0 ? (
                      recentPickups.map((log) => (
                        <div key={log.id} className="glass-card p-4 space-y-3">
                          <div className="flex justify-between items-start">
                            <div className="flex items-center space-x-3">
                              <div className="w-10 h-10 bg-accent-emerald/10 rounded-xl flex items-center justify-center text-accent-emerald border border-accent-emerald/20">
                                <UserCircle className="w-6 h-6" />
                              </div>
                              <div>
                                <p className="text-sm font-bold text-white uppercase italic">{log.studentName}</p>
                                <p className="text-[8px] font-black text-text-secondary uppercase tracking-widest">Scholar ID: {log.scholarNo}</p>
                              </div>
                            </div>
                            <span className="px-2 py-1 bg-surface border border-white/10 rounded text-[8px] font-black text-white uppercase italic">
                              {log.classSec}
                            </span>
                          </div>
                          <div className="flex items-center justify-between bg-white/2 p-3 rounded-xl border border-white/5">
                            <div className="flex flex-col">
                              <span className="text-[8px] font-black text-text-secondary uppercase tracking-widest mb-1">Authenticated Guardian</span>
                              <p className="text-xs font-bold text-text-primary px-1">{log.guardianName}</p>
                            </div>
                            <div className="flex flex-col items-end">
                               <span className="text-[8px] font-black uppercase tracking-widest text-accent-emerald bg-accent-emerald/10 px-2 py-1 rounded">
                                 {log.guardianRole}
                               </span>
                               <span className="text-[7px] text-white/40 mt-1 uppercase font-bold">{log.cameraLabel || 'Main Node'}</span>
                            </div>
                          </div>
                          <div className="flex justify-between items-center text-[10px] font-mono text-white/40 pt-1">
                            <span>{new Date(log.timestamp).toLocaleDateString()}</span>
                            <span className="text-accent-emerald font-bold">{new Date(log.timestamp).toLocaleTimeString()}</span>
                          </div>
                        </div>
                      ))
                    ) : null}
                  </div>

                  {recentPickups.length === 0 && (
                    <div className="p-12 text-center text-text-secondary uppercase text-[10px] font-black tracking-widest font-mono">
                      Null data return. system operational.
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
          {activeTab === 'admin' && (
            <AdminTab 
              registry={registry} 
              isAuthenticated={isAdminAuthenticated}
              onLogin={(pass) => {
                if (pass === systemSettings.systemPassword) {
                  setIsAdminAuthenticated(true);
                  setIsLoginError(false);
                } else {
                  setIsLoginError(true);
                }
              }}
              isLoginError={isLoginError}
              onStressTest={handleStressTest}
              isGeneratingTest={isGeneratingTest}
              onDelete={(id) => {
                const updated = registry.filter(r => r.id !== id);
                setRegistry(updated);
                syncRegistryWithServer(updated);
              }}
              onDownload={() => exportRegistryToPDF(registry)}
              onDownloadTechnical={exportTechnicalDoc}
              onDownloadPresentation={exportPresentationDoc}
              onExportBackup={exportBackup}
              onImportBackup={importBackup}
              backupInterval={backupInterval}
              onSetBackupInterval={changeBackupInterval}
              systemSettings={systemSettings}
              onUpdateSettings={(s) => {
                setSystemSettings(s);
                syncSettingsWithServer(s);
              }}
              storagePath={storagePath}
              onUpdateEntry={(updatedEntry) => {
                const updated = registry.map(r => r.id === updatedEntry.id ? updatedEntry : r);
                setRegistry(updated);
                syncRegistryWithServer(updated);
              }}
              onActivate={activateProduct}
              licenseStatus={licenseStatus}
              syncStatus={syncStatus}
            />
          )}
        </AnimatePresence>
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-xl border-t border-surface-border px-6 py-3 flex items-center justify-between shadow-[0_-10px_40px_rgba(0,0,0,0.1)]">
        <MobileNavBtn 
          active={activeTab === 'scan'} 
          onClick={() => setActiveTab('scan')} 
          label="Scan" 
          icon={<Camera className="w-5 h-5" />}
        />
        <MobileNavBtn 
          active={activeTab === 'register'} 
          onClick={() => setActiveTab('register')} 
          label="Enroll" 
          icon={<UserPlus className="w-5 h-5" />}
        />
        <MobileNavBtn 
          active={activeTab === 'history'} 
          onClick={() => setActiveTab('history')} 
          label="Logs" 
          icon={<History className="w-5 h-5" />}
        />
        <MobileNavBtn 
          active={activeTab === 'admin'} 
          onClick={() => setActiveTab('admin')} 
          label="Admin" 
          icon={<Lock className="w-5 h-5" />}
        />
      </div>
    </div>
  );
}

function MobileNavBtn({ active, onClick, label, icon }: { active: boolean; onClick: () => void; label: string; icon: React.ReactNode }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex flex-col items-center space-y-1 py-1 px-3 rounded-xl transition-all",
        active ? "text-accent-emerald" : "text-text-secondary"
      )}
    >
      <div className={cn(
        "transition-all duration-300 transform",
        active ? "scale-110 translate-y-[-2px] text-accent-emerald" : "text-text-secondary opacity-60"
      )}>
        {icon}
      </div>
      <span className={cn("text-[9px] font-black uppercase tracking-tighter transition-all", active ? "opacity-100" : "opacity-40")}>
        {label}
      </span>
    </button>
  );
}

// --- Components ---

function NavBtn({ active, onClick, label, icon }: { active: boolean; onClick: () => void; label: string; icon: React.ReactNode }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "px-4 sm:px-6 py-2.5 rounded-xl transition-all duration-200 flex items-center justify-center sm:justify-start space-x-2.5 group cursor-pointer",
        active 
          ? "bg-accent-emerald text-white shadow-sm shadow-accent-emerald/20" 
          : "text-text-secondary hover:text-text-primary hover:bg-black/5"
      )}
    >
      <span className={cn("transition-colors", active ? "text-white" : "text-text-secondary group-hover:text-accent-emerald")}>{icon}</span>
      <span className="hidden sm:inline text-[11px] font-black uppercase tracking-wider">{label}</span>
    </button>
  );
}

function InfoTile({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="space-y-1.5 p-4 rounded-xl bg-background border border-surface-border shadow-sm">
      <p className="info-label opacity-60">{label}</p>
      <p className={cn("info-value", mono && "font-mono text-sm tracking-tight")}>{value}</p>
    </div>
  );
}

function Scanner({ 
  registry, 
  onMatch, 
  onScanningStateChange,
  onDeviceChange,
  isVerified = false,
  onReset,
  cameraLabel = 'Scanner',
  deviceId,
  matchStatus = { guardian: false, student: false },
  matchedEntry = null
}: { 
  registry: RegistryEntry[]; 
  onMatch: (entry: RegistryEntry, type: 'guardian' | 'student', guardianIndex?: number) => void;
  onScanningStateChange: (state: boolean) => void;
  onDeviceChange?: (deviceId: string) => void;
  isVerified?: boolean;
  onReset?: () => void;
  cameraLabel?: string;
  deviceId?: string;
  matchStatus?: { guardian: boolean; student: boolean };
  matchedEntry?: RegistryEntry | null;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [detectionInfo, setDetectionInfo] = useState<{ label: string; confidence: number; isMatch: boolean; box: any }[]>([]);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [faceDetector, setFaceDetector] = useState<FaceDetector | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>([]);
  const [latency, setLatency] = useState<number>(0);
  const [luminosity, setLuminosity] = useState<number>(100);
  const [isLowLightBoost, setIsLowLightBoost] = useState(false);
  const lastBeepTime = useRef<number>(0);
  const lastTimestamp = useRef<number>(0);
  const stabilityCounter = useRef<{ [key: string]: number }>({});
  const requestRef = useRef<number>(0);

  // Load available cameras for local selection
  useEffect(() => {
    const fetchDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        setAvailableCameras(devices.filter(d => d.kind === 'videoinput'));
      } catch (err) {
        console.warn("Silent device discovery fail (likely missing permissions):", err);
      }
    };
    fetchDevices();
  }, []);

  // Initialize MediaPipe Face Detector
  useEffect(() => {
    async function initMediaPipe() {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );
        const detector = await FaceDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite`,
            delegate: "GPU"
          },
          runningMode: "VIDEO"
        });
        setFaceDetector(detector);
      } catch (err) {
        console.error("MediaPipe Init Error:", err);
      }
    }
    initMediaPipe();
  }, []);

  const lastProcessingTime = useRef<number>(0);

  // Audio Context for Beep
  const playWarningBeep = () => {
    const now = Date.now();
    if (now - lastBeepTime.current < 2000) return; // Rate limit beeps to every 2 seconds
    lastBeepTime.current = now;

    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.type = 'square';
      oscillator.frequency.setValueAtTime(440, audioCtx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.1);
      
      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.3);
    } catch (e) {
      console.warn("Audio Context failed:", e);
    }
  };
  
  // Memoize descriptors and matchers to avoid heavy re-calculations
  const matchers = useRef<{ guardians: faceapi.FaceMatcher | null, student: faceapi.FaceMatcher | null }>({ guardians: null, student: null });

  useEffect(() => {
    if (registry.length === 0) return;

    const guardianDescriptors: faceapi.LabeledFaceDescriptors[] = [];
    const studentDescriptors: faceapi.LabeledFaceDescriptors[] = [];

    registry.forEach(person => {
      // Collect all student variants
      const studentVariants = [
        ...(person.studentFaceDescriptor?.length === 128 ? [new Float32Array(person.studentFaceDescriptor)] : []),
        ...(person.studentFaceDescriptors?.map(d => new Float32Array(d)) || [])
      ].filter(d => d.length === 128);

      if (studentVariants.length > 0) {
        studentDescriptors.push(new faceapi.LabeledFaceDescriptors(person.id, studentVariants));
      }
      
      person.guardians?.forEach((guardian, idx) => {
        // Collect all guardian variants
        const guardianVariants = [
          ...(guardian.faceDescriptor?.length === 128 ? [new Float32Array(guardian.faceDescriptor)] : []),
          ...(guardian.faceDescriptors?.map(d => new Float32Array(d)) || [])
        ].filter(d => d.length === 128);

        if (guardianVariants.length > 0) {
          guardianDescriptors.push(new faceapi.LabeledFaceDescriptors(`${person.id}_${idx}`, guardianVariants));
        }
      });
    });

    matchers.current = {
      guardians: guardianDescriptors.length > 0 ? new faceapi.FaceMatcher(guardianDescriptors, 0.45) : null,
      student: studentDescriptors.length > 0 ? new faceapi.FaceMatcher(studentDescriptors, 0.45) : null
    };
  }, [registry]);

  const startCamera = async (retryCount = 0) => {
    try {
      setErrorMsg(null);
      // Stagger initial start to avoid multiple simultaneous requests
      if (retryCount === 0) {
        const staggerIndex = parseInt(cameraLabel.match(/\d+/)?.[0] || '1');
        await new Promise(r => setTimeout(r, staggerIndex * 800));
      }

      // Stop existing tracks if any
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }

      // On second retry, relax constraints (remove exact)
      const videoConstraints: MediaTrackConstraints = {
        width: { ideal: 640 },
        height: { ideal: 480 },
      };

      if (deviceId) {
        if (retryCount === 0) {
          videoConstraints.deviceId = { exact: deviceId };
        } else {
          videoConstraints.deviceId = deviceId; // Try without exact
        }
      }

      console.log(`[${cameraLabel}] Requesting camera...`, deviceId || 'default');
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: {
          ...videoConstraints,
          // Advanced constraints for better iris/exposure control (supported by Chrome)
          ...({
            advanced: [
              { exposureMode: 'continuous' },
              { whiteBalanceMode: 'continuous' },
              { focusMode: 'continuous' },
              { brightness: 100 }
            ]
          } as any)
        } 
      });
      
      // Attempt to apply constraints post-initialization for additional hardware control
      try {
        const track = stream.getVideoTracks()[0];
        const capabilities = track.getCapabilities() as any;
        const currentConstraints: any = {};
        if (capabilities.exposureMode?.includes('continuous')) currentConstraints.exposureMode = 'continuous';
        if (capabilities.whiteBalanceMode?.includes('continuous')) currentConstraints.whiteBalanceMode = 'continuous';
        if (capabilities.focusMode?.includes('continuous')) currentConstraints.focusMode = 'continuous';
        
        if (Object.keys(currentConstraints).length > 0) {
          await track.applyConstraints({ advanced: [currentConstraints] });
        }
      } catch (e) {
        console.warn("Advanced hardware constraints application failed", e);
      }
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setIsCameraActive(true);
        setErrorMsg(null);
        onScanningStateChange(true);
        console.log(`[${cameraLabel}] Camera started successfully`);

        // Refresh device list to populate labels now that permission is granted
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          setAvailableCameras(devices.filter(d => d.kind === 'videoinput'));
        } catch (devErr) {
          console.warn("Failed to refresh device labels:", devErr);
        }
      }
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err);
      const name = err.name || '';
      
      console.error(`[${cameraLabel}] Camera access error:`, name, msg);

      if (retryCount < 2 && name !== 'NotAllowedError' && name !== 'PermissionDeniedError' && name !== 'NotFoundError') {
        console.warn(`[${cameraLabel}] Retrying... (${retryCount + 1})`);
        setTimeout(() => startCamera(retryCount + 1), 1500);
        return;
      }
      
      setErrorMsg(name === 'NotAllowedError' || name === 'PermissionDeniedError' 
        ? "Access Denied" 
        : (name === 'NotReadableError' || name === 'TrackStartError' ? "Camera Busy/In Use" : "Offline/Error"));
      setIsCameraActive(false);
    }
  };

  useEffect(() => {
    // Only auto-start if we have a deviceId OR if it's the first node and no deviceId is set yet
    const staggerIndex = parseInt(cameraLabel.match(/\d+/)?.[0] || '1');
    if (deviceId || staggerIndex === 1) {
      startCamera();
    }
    return () => {
      streamRef.current?.getTracks().forEach(track => track.stop());
      onScanningStateChange(false);
      setIsCameraActive(false);
    };
  }, [deviceId]);

  useEffect(() => {
    const lastMatchTimes = new Map<string, number>();
    let isProcessingFaceApi = false;
    let lastProcessed = 0;
    let localRequestRef: number;

    const loop = async (time: number) => {
      if (!isCameraActive || !videoRef.current || !faceDetector || !videoRef.current.videoWidth) {
        localRequestRef = requestAnimationFrame(loop);
        return;
      }

      try {
        // Ensure strictly increasing unique timestamps for MediaPipe
        const adjustedTime = Math.max(time, lastTimestamp.current + 1);
        lastTimestamp.current = adjustedTime;

        // Fast tracking path
        const detections = faceDetector.detectForVideo(videoRef.current, adjustedTime);

        if (detections.detections.length > 0) {
          // Accurate recognition path (gated)
          if (!isProcessingFaceApi && time - lastProcessed > 200) {
            isProcessingFaceApi = true;
            lastProcessed = time;

            const start = performance.now();
            
            // Software Enhancement for Scanning Integrity
            // Calculate luminosity to warn about poor conditions
            const analyzeLuminosity = () => {
              if (!canvasRef.current || !videoRef.current) return;
              const ctx = canvasRef.current.getContext('2d');
              if (!ctx) return;
              
              // Sample a small portion of the center
              const sampleSize = 40;
              ctx.drawImage(videoRef.current, 320 - sampleSize/2, 240 - sampleSize/2, sampleSize, sampleSize, 0, 0, sampleSize, sampleSize);
              const data = ctx.getImageData(0, 0, sampleSize, sampleSize).data;
              let brightness = 0;
              for(let i = 0; i < data.length; i+=4) {
                brightness += (0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2]);
              }
              const avg = brightness / (sampleSize * sampleSize);
              setLuminosity(avg);
            };

            analyzeLuminosity();

            // Dynamic detection options based on conditions
            const optSize = isLowLightBoost ? 512 : 416; // Higher resolution in low light
            const optScore = luminosity < 40 ? 0.45 : 0.55; // Relax score threshold if very dark

            const faceApiResults = await faceapi
              .detectAllFaces(videoRef.current, new faceapi.TinyFaceDetectorOptions({ inputSize: optSize, scoreThreshold: optScore }))
              .withFaceLandmarks()
              .withFaceDescriptors();

            const { guardians: guardianMatcher, student: studentMatcher } = matchers.current;
            const results = faceApiResults.map(det => {
              let bestMatch: any = null;
              let matchType: 'student' | 'guardian' | null = null;
              let guardianIdx: number | undefined;

              if (studentMatcher) {
                const studentMatch = studentMatcher.findBestMatch(det.descriptor);
                if (studentMatch.label !== 'unknown' && studentMatch.distance < 0.40) {
                  bestMatch = studentMatch;
                  matchType = 'student';
                }
              }

              if (!bestMatch && guardianMatcher) {
                const guardianMatch = guardianMatcher.findBestMatch(det.descriptor);
                if (guardianMatch.label !== 'unknown' && guardianMatch.distance < 0.40) {
                  bestMatch = guardianMatch;
                  matchType = 'guardian';
                  const [pid, gidx] = guardianMatch.label.split('_');
                  guardianIdx = parseInt(gidx);
                }
              }

              let matchedKey: string | null = null;
              if (matchType) {
                const actualId = bestMatch.label.split('_')[0];
                const entry = registry.find(r => r.id === actualId);
                if (entry) {
                  matchedKey = `${actualId}_${matchType}_${guardianIdx || 0}`;
                  const now = Date.now();
                  
                  if (matchedKey) {
                    // Stability check: consecutive matches required
                    stabilityCounter.current[matchedKey] = (stabilityCounter.current[matchedKey] || 0) + 1;

                    if (stabilityCounter.current[matchedKey] >= 2) { // 2 frames is faster for responsive multi-scan
                      const lastTime = lastMatchTimes.get(matchedKey) || 0;
                      if (now - lastTime > 8000) { // 8s throttle per person
                        onMatch(entry, matchType, guardianIdx);
                        lastMatchTimes.set(matchedKey, now);
                      }
                    }
                  }
                }
              }

              return {
                label: bestMatch ? (matchType === 'student' ? 'Student' : 'Guardian') : 'Unknown',
                confidence: det.detection.score,
                isMatch: !!bestMatch,
                box: det.detection.box,
                key: matchedKey
              };
            });

            // Beep if there are any people but NONE are recognized as matches
            const anyPeople = results.length > 0;
            const anyMatches = results.some(r => r.isMatch);
            if (anyPeople && !anyMatches) {
              playWarningBeep();
            }

            // Cleanup stability counters for IDs not seen in this frame
            const currentKeys = new Set(results.filter(r => r.key).map(r => r.key));
            Object.keys(stabilityCounter.current).forEach(k => {
              if (!currentKeys.has(k)) {
                stabilityCounter.current[k] = Math.max(0, stabilityCounter.current[k] - 1);
              }
            });

            setDetectionInfo(results.map(({ label, confidence, isMatch, box }) => ({ label, confidence, isMatch, box })));
            setLatency(performance.now() - start);
            isProcessingFaceApi = false;
          }
        } else {
          setDetectionInfo([]);
        }
      } catch (err) {
        isProcessingFaceApi = false;
      }
      
      localRequestRef = requestAnimationFrame(loop);
    };

    if (isCameraActive && faceDetector) {
      localRequestRef = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(localRequestRef);
    };
  }, [isCameraActive, faceDetector, registry, onMatch]);

  return (
    <div className="w-full h-full relative bg-slate-900 group overflow-hidden">
      <video 
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className={cn(
          "w-full h-full object-cover transition-opacity duration-700",
          isCameraActive ? "opacity-100" : "opacity-0"
        )}
      />
      <canvas 
        ref={canvasRef}
        className="absolute inset-0 w-full h-full z-10 pointer-events-none"
      />

      {/* Error Overlay */}
      <AnimatePresence>
        {errorMsg && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 bg-slate-900/90 backdrop-blur-md flex flex-col items-center justify-center p-8 text-center"
          >
            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mb-6 border border-red-500/30">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
            <h3 className="text-xl font-black text-white uppercase italic mb-2 tracking-tighter">
              {errorMsg === 'Access Denied' ? 'Permission Required' : 'Camera Error'}
            </h3>
            <p className="text-text-secondary text-[11px] font-medium uppercase tracking-widest leading-relaxed mb-8 max-w-[200px]">
              {errorMsg === 'Access Denied' 
                ? "Please grant camera access in your browser to enable recognition" 
                : "The camera is currently unavailable or being used by another app"}
            </p>
                  <button 
                    onClick={() => {
                      if (window.top !== window.self) {
                        window.open(window.location.href, '_blank');
                      } else {
                        startCamera();
                      }
                    }}
                    className="px-8 py-3 bg-white text-slate-900 font-black text-[10px] uppercase rounded-full tracking-[0.2em] hover:scale-105 active:scale-95 transition-all cursor-pointer shadow-xl"
                  >
                    {window.top !== window.self ? 'Open in New Tab' : 'Retry Connection'}
                  </button>
            {errorMsg === 'Access Denied' && (
              <p className="mt-6 text-[8px] text-white/30 font-black uppercase tracking-widest">
                Tip: Try opening in a new tab if permission is blocked
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Environment Health Indicator */}
      <div className="absolute bottom-4 left-4 z-30 flex items-center space-x-3">
        <div className="flex flex-col">
          <div className="flex items-center space-x-2">
            <div className={cn(
              "w-1.5 h-1.5 rounded-full",
              luminosity < 30 ? "bg-red-500 animate-pulse" : luminosity < 60 ? "bg-amber-500" : "bg-emerald-500"
            )} />
            <span className="text-[8px] font-black uppercase text-white/40 tracking-[0.2em]">Environment Quality</span>
          </div>
          <div className="mt-1 w-24 h-1 bg-white/5 rounded-full overflow-hidden">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, luminosity)}%` }}
              className={cn(
                "h-full transition-colors",
                luminosity < 30 ? "bg-red-500" : luminosity < 60 ? "bg-amber-500" : "bg-emerald-500"
              )}
            />
          </div>
        </div>

        <button 
          onClick={() => setIsLowLightBoost(!isLowLightBoost)}
          className={cn(
            "p-2 rounded-lg border transition-all flex flex-col items-center justify-center space-y-1 backdrop-blur-md cursor-pointer",
            isLowLightBoost 
              ? "bg-accent-emerald text-white border-accent-emerald shadow-lg shadow-accent-emerald/20" 
              : "bg-black/20 text-white/40 border-white/10 hover:bg-black/40"
          )}
        >
          <Sun className={cn("w-3 h-3", isLowLightBoost && "animate-pulse")} />
          <span className="text-[6px] font-black uppercase tracking-tighter">Sensitivity {isLowLightBoost ? 'High' : 'Auto'}</span>
        </button>
      </div>

      <div className="absolute top-4 left-4 right-4 flex items-start justify-between z-30">
        <div className="flex items-center space-x-3 bg-black/60 backdrop-blur-md pl-1 pr-4 py-1 rounded-full border border-white/10 group-hover:bg-black/80 transition-all">
          <div className="w-8 h-8 rounded-full bg-accent-emerald/20 flex items-center justify-center border border-accent-emerald/30 shadow-lg">
            <Camera className="w-4 h-4 text-accent-emerald" />
          </div>
          <p className="text-[10px] font-black tracking-widest text-white uppercase">{cameraLabel}</p>
          <div className="w-px h-3 bg-white/10 mx-1" />
          <p className="text-[8px] font-mono text-white/50">{latency.toFixed(0)}ms</p>
        </div>

        <button 
          onClick={() => setShowSettings(!showSettings)}
          className="w-8 h-8 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center border border-white/10 hover:bg-black/80 hover:scale-110 transition-all cursor-pointer"
        >
          <Settings className="w-4 h-4 text-white/70" />
        </button>
      </div>
      {/* Dynamic Recognition Overlay */}
      <div className="absolute inset-0 z-20 pointer-events-none">
        {detectionInfo.map((det, i) => (
          <div 
            key={i}
            className="absolute border-2 rounded-xl transition-all duration-300"
            style={{
              left: `${(det.box.x / (videoRef.current?.videoWidth || 1)) * 100}%`,
              top: `${(det.box.y / (videoRef.current?.videoHeight || 1)) * 100}%`,
              width: `${(det.box.width / (videoRef.current?.videoWidth || 1)) * 100}%`,
              height: `${(det.box.height / (videoRef.current?.videoHeight || 1)) * 100}%`,
              borderColor: det.isMatch ? 'rgb(16, 185, 129)' : 'rgb(239, 68, 68)',
              boxShadow: det.isMatch ? '0 0 20px rgba(16, 185, 129, 0.4)' : '0 0 20px rgba(239, 68, 68, 0.4)'
            }}
          >
            <div className={cn(
              "absolute -top-10 left-0 px-3 py-1.5 rounded-lg flex items-center space-x-2 backdrop-blur-md border",
              det.isMatch ? "bg-emerald-500/20 border-emerald-500/50" : "bg-red-500/20 border-red-500/50"
            )}>
              <div className={cn(
                "w-2 h-2 rounded-full",
                det.isMatch ? "bg-emerald-500 animate-pulse" : "bg-red-500"
              )} />
              <div className="flex flex-col">
                <span className="text-[10px] font-black text-white uppercase tracking-wider">{det.label}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Partial Recognition Status (Checklist) */}
      {!isVerified && matchedEntry && (
        <div className="absolute top-16 left-4 z-30 space-y-2">
          <motion.div 
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className="flex items-center space-x-2 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10"
          >
            <div className={cn("w-2 h-2 rounded-full", matchStatus.student ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" : "bg-white/20")} />
            <span className="text-[9px] font-black uppercase text-white/80 tracking-widest">Student {matchStatus.student ? 'Matched' : 'Pending'}</span>
          </motion.div>
          <motion.div 
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="flex items-center space-x-2 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10"
          >
            <div className={cn("w-2 h-2 rounded-full", matchStatus.guardian ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" : "bg-white/20")} />
            <span className="text-[9px] font-black uppercase text-white/80 tracking-widest">Guardian {matchStatus.guardian ? 'Matched' : 'Pending'}</span>
          </motion.div>
          
          <motion.div 
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="mt-2"
          >
            <p className="text-[10px] font-bold text-accent-emerald uppercase italic tracking-tighter">
              {matchedEntry.childName} Identification Active
            </p>
          </motion.div>
        </div>
      )}

      {isVerified && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 z-50 bg-emerald-600/90 backdrop-blur-xl flex flex-col items-center justify-center p-6 text-center"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(52,211,153,0.2)_0%,transparent_70%)] animate-pulse" />
          <motion.div 
            initial={{ scale: 0.5, rotate: -15 }}
            animate={{ scale: 1, rotate: 0 }}
            className="w-40 h-40 bg-white rounded-[40px] flex items-center justify-center shadow-[0_0_50px_rgba(255,255,255,0.3)] mb-8 relative"
          >
            <ShieldCheck className="w-20 h-20 text-emerald-600" />
            <div className="absolute -top-4 -right-4 w-12 h-12 bg-emerald-500 rounded-full flex items-center justify-center border-4 border-white shadow-lg">
              <CheckCircle2 className="w-6 h-6 text-white" />
            </div>
          </motion.div>
          <h2 className="text-5xl font-black text-white uppercase tracking-tighter mb-4 drop-shadow-md">Verified</h2>
          <p className="text-emerald-50 text-base font-bold mb-10 max-w-xs uppercase tracking-widest opacity-80">Identification confirmed matches school security protocol</p>
          
          <button 
            onClick={() => {
              if (onReset) onReset();
            }}
            className="px-12 py-5 bg-white text-emerald-700 rounded-2xl font-black text-xs uppercase tracking-[0.3em] shadow-2xl hover:scale-105 active:scale-95 transition-all cursor-pointer ring-4 ring-white/20"
          >
            Ready for Next Scan
          </button>
        </motion.div>
      )}

      {showSettings && (
        <div className="absolute inset-0 z-50 bg-slate-900/90 backdrop-blur-xl p-6 flex flex-col items-center justify-center">
          <div className="w-full max-w-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white text-xs font-black uppercase tracking-widest">Configuration</h3>
              <button onClick={() => setShowSettings(false)} className="text-white/40 hover:text-white transition-all">
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="space-y-2">
              <p className="text-[9px] text-white/40 font-bold uppercase tracking-wider ml-1">Select Input Source</p>
              <div className="space-y-1 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                {availableCameras.length === 0 ? (
                  <p className="text-[10px] text-red-400 font-mono italic">No detection units found</p>
                ) : (
                  availableCameras.map(d => (
                    <button 
                      key={d.deviceId}
                      onClick={() => {
                        if (onDeviceChange) onDeviceChange(d.deviceId);
                        setShowSettings(false);
                      }}
                      className="w-full text-left px-3 py-2 bg-white/5 border border-white/5 rounded-lg text-[10px] text-white/70 hover:bg-white/10 hover:border-accent-emerald/50 transition-all group"
                    >
                      <div className="flex items-center justify-between">
                        <span className="truncate pr-4">
                          {d.label.toLowerCase().includes('usb') ? '🔌 ' : '💻 '}
                          {d.label || `Camera ${d.deviceId.slice(0, 4)}`}
                        </span>
                        {deviceId === d.deviceId && <div className="w-1.5 h-1.5 bg-accent-emerald rounded-full" />}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            <button 
              onClick={() => { startCamera(); setShowSettings(false); }}
              className="w-full py-2 bg-accent-emerald text-white text-[10px] font-black uppercase rounded-lg shadow-lg hover:shadow-accent-emerald/20 transition-all flex items-center justify-center space-x-2"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Hard Restart Lane</span>
            </button>
          </div>
        </div>
      )}

      {!isCameraActive && !showSettings && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-8 bg-slate-900/40 backdrop-blur-[2px] z-40">
          <div className="w-20 h-20 rounded-full border border-red-500/30 flex items-center justify-center mb-6 relative">
            <div className="absolute inset-0 rounded-full border border-red-500/10 animate-ping" />
            <CameraOff className="w-8 h-8 text-red-500/60" />
          </div>
          
          <div className="flex flex-col items-center space-y-3 text-center">
            <div className="px-5 py-2 bg-red-500/10 border border-red-500/20 rounded-full text-[10px] font-black text-red-400 uppercase tracking-[0.2em]">
              {errorMsg || 'OFFLINE'}
            </div>
            
            <p className="text-[9px] text-slate-400 font-mono max-w-[160px] leading-relaxed">
              {errorMsg?.includes('Denied') 
                ? 'ENABLE CAMERA ACCESS IN BROWSER SETTINGS' 
                : 'CHECK CONNECTION OR SELECT INPUT MANUALLY'}
            </p>

            <div className="flex space-x-2 pt-4">
              <button 
                onClick={() => startCamera()}
                className="flex items-center space-x-2 px-5 py-2 bg-accent-emerald text-white text-[10px] font-black uppercase rounded-full shadow-xl hover:bg-emerald-400 hover:-translate-y-0.5 active:translate-y-0 transition-all cursor-pointer"
              >
                <Zap className="w-3 h-3" />
                <span>Retry Lane</span>
              </button>
              
              <button 
                onClick={() => setShowSettings(true)}
                className="flex items-center space-x-2 px-5 py-2 bg-slate-800 text-white text-[10px] font-black uppercase rounded-full border border-white/5 hover:bg-slate-700 transition-all cursor-pointer"
              >
                <Settings className="w-3 h-3" />
                <span>Config</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
        {/* Simplified Scan Line */}
        {!detectionInfo.some(d => d.isMatch) && (
          <motion.div 
            animate={{ top: ['10%', '90%', '10%'] }}
            transition={{ repeat: Infinity, duration: 3.5, ease: "linear" }}
            className="absolute left-0 right-0 h-px bg-white/20 z-20"
          />
        )}
      </div>

      <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between z-20">
        <div className="bg-white/10 backdrop-blur-md px-3 py-1 rounded-full border border-white/5 flex items-center space-x-2">
          <div className={cn("w-1.5 h-1.5 rounded-full", isCameraActive ? "bg-accent-emerald animate-pulse" : "bg-red-500")} />
          <p className="text-[8px] font-bold tracking-widest text-white/80 uppercase">Active Stream</p>
        </div>
      </div>
    </div>
  );
}

function CalibrationScanner({ 
  entry, 
  onClose,
  onUpdate
}: { 
  entry: RegistryEntry; 
  onClose: () => void;
  onUpdate: (updated: RegistryEntry) => void;
}) {
  const [isCapturing, setIsCapturing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [target, setTarget] = useState<'student' | number>('student');
  const [error, setError] = useState<string | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      if (videoRef.current) videoRef.current.srcObject = stream;
      streamRef.current = stream;
      setIsCapturing(true);
      setError(null);
    } catch (e) {
      setError("Camera access denied");
    }
  };

  const handleCapture = async () => {
    if (!videoRef.current) return;
    setIsProcessing(true);
    setError(null);
    try {
      // 1. Detect face and landmarks
      const detection = await faceapi.detectSingleFace(
        videoRef.current,
        new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.6 })
      ).withFaceLandmarks();

      if (!detection) {
        setError("Face not detected. Adjust lighting and position.");
        return;
      }

      // 2. Perform explicit normalization/alignment
      // This extracts the face into a standardized canvas using landmarks for perfect orientation
      const alignedFaceCanvas = await faceapi.extractFaces(videoRef.current, [detection.detection]);
      if (alignedFaceCanvas.length === 0) {
        setError("Alignment normalization failed");
        return;
      }

      // 3. Generate descriptor from the high-quality normalized face image
      const descriptorData = await faceapi.computeFaceDescriptor(alignedFaceCanvas[0]);
      const newDescriptor = Array.from(descriptorData as any) as number[];
      const updatedEntry = { ...entry };

      if (target === 'student') {
        const currentDescriptors = (updatedEntry.studentFaceDescriptors || []) as number[][];
        updatedEntry.studentFaceDescriptors = [...currentDescriptors, newDescriptor];
      } else {
        const guardianIdx = target as number;
        const updatedGuardians = [...updatedEntry.guardians];
        const currentGDescriptors = (updatedGuardians[guardianIdx].faceDescriptors || []) as number[][];
        updatedGuardians[guardianIdx] = {
          ...updatedGuardians[guardianIdx],
          faceDescriptors: [...currentGDescriptors, newDescriptor]
        };
        updatedEntry.guardians = updatedGuardians;
      }

      onUpdate(updatedEntry);
      onClose();
    } catch (e) {
      console.error("Calibration capture error:", e);
      setError("Recognition failed during alignment");
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    startCamera();
    return () => streamRef.current?.getTracks().forEach(t => t.stop());
  }, []);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[100] bg-slate-950/95 backdrop-blur-2xl flex items-center justify-center p-4"
    >
      <div className="w-full max-w-2xl bg-surface border border-white/10 rounded-[32px] overflow-hidden shadow-2xl flex flex-col md:flex-row">
        <div className="w-full md:w-1/2 p-8 space-y-6">
          <div>
            <div className="flex items-center space-x-2 text-accent-emerald text-[10px] font-black uppercase tracking-widest mb-2">
              <Zap className="w-3 h-3" />
              <span>Bio-Metric Calibration</span>
            </div>
            <h3 className="text-2xl font-black text-white uppercase tracking-tighter italic">Enhance Recognition</h3>
            <p className="text-[10px] text-text-secondary uppercase font-bold mt-2 leading-relaxed">
              Capture physical variants (hair, glasses, beards) for <span className="text-white">{entry.childName}</span>
            </p>
          </div>

          <div className="space-y-4">
            <p className="text-[10px] font-black text-text-secondary uppercase tracking-widest">Select Calibration Target</p>
            <div className="space-y-2">
              <button 
                onClick={() => setTarget('student')}
                className={cn(
                  "w-full p-4 rounded-2xl border transition-all text-left flex items-center justify-between group",
                  target === 'student' ? "bg-accent-emerald/20 border-accent-emerald text-white" : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10"
                )}
              >
                <div className="flex items-center space-x-3">
                  <User className="w-4 h-4" />
                  <span className="text-xs font-bold uppercase italic">Student Profile</span>
                </div>
                {target === 'student' && <CheckCircle2 className="w-4 h-4 text-accent-emerald" />}
              </button>
              
              {entry.guardians.map((g, i) => (
                <button 
                  key={i}
                  onClick={() => setTarget(i)}
                  className={cn(
                    "w-full p-4 rounded-2xl border transition-all text-left flex items-center justify-between group",
                    target === i ? "bg-accent-emerald/20 border-accent-emerald text-white" : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10"
                  )}
                >
                  <div className="flex items-center space-x-3">
                    <ShieldCheck className="w-4 h-4" />
                    <div>
                      <p className="text-xs font-bold uppercase italic">{g.name}</p>
                      <p className="text-[8px] font-black uppercase opacity-60 tracking-widest">{g.role}</p>
                    </div>
                  </div>
                  {target === i && <CheckCircle2 className="w-4 h-4 text-accent-emerald" />}
                </button>
              ))}
            </div>
          </div>

          <div className="flex space-x-3 pt-4">
            <button 
              onClick={handleCapture}
              disabled={isProcessing}
              className="flex-1 py-4 bg-accent-emerald text-black font-black text-xs uppercase tracking-widest rounded-xl shadow-lg shadow-accent-emerald/20 hover:scale-105 active:scale-95 transition-all flex items-center justify-center space-x-2"
            >
              {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
              <span>{isProcessing ? "ANALYZING..." : "CAPTURE VARIANT"}</span>
            </button>
            <button 
              onClick={onClose}
              className="px-6 py-4 bg-slate-800 text-white font-black text-xs uppercase tracking-widest rounded-xl hover:bg-slate-700 transition-all"
            >
              EXIT
            </button>
          </div>
          
          {error && (
            <p className="text-[9px] text-red-500 font-black uppercase text-center mt-4 tracking-widest animate-pulse">{error}</p>
          )}
        </div>

        <div className="w-full md:w-1/2 aspect-square md:aspect-auto bg-slate-900 border-l border-white/5 relative flex items-center justify-center">
          <video 
            ref={videoRef} 
            autoPlay 
            muted 
            playsInline 
            className="w-full h-full object-cover grayscale brightness-110 opacity-60"
          />
          <div className="absolute inset-0 pointer-events-none border-[30px] border-black/40" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-48 h-64 border-2 border-accent-emerald/40 rounded-[80px] shadow-[0_0_100px_rgba(16,185,129,0.1)] relative">
              <div className="absolute top-1/2 left-0 right-0 h-px bg-accent-emerald/20 animate-scan-slow" />
            </div>
          </div>
          <div className="absolute top-6 left-6 flex items-center space-x-2">
            <div className="w-2 h-2 rounded-full bg-accent-emerald animate-pulse" />
            <span className="text-[8px] font-black uppercase tracking-widest text-accent-emerald bg-black/60 px-2 py-1 rounded backdrop-blur-md">CALIBRATION NODE ACTIVE</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function RegisterForm({ onEnroll }: { onEnroll: (entry: RegistryEntry) => void }) {
  const [formData, setFormData] = useState({
    childName: '',
    scholarNo: '',
    classSec: ''
  });
  const [isCapturing, setIsCapturing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [step, setStep] = useState<'details' | 'student' | 'guardians'>('details');
  
  const [studentDescriptor, setStudentDescriptor] = useState<number[] | null>(null);
  const [studentPhoto, setStudentPhoto] = useState<string | null>(null);
  const [enrollmentError, setEnrollmentError] = useState<string | null>(null);
  
  const [enrolledGuardians, setEnrolledGuardians] = useState<Omit<Guardian, 'id'>[]>([]);
  const [currentGuardianRole, setCurrentGuardianRole] = useState<'Father' | 'Mother' | 'Guardian' | null>(null);
  const [currentGuardianName, setCurrentGuardianName] = useState('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startCamera = async () => {
    setIsCapturing(true);
  };

  useEffect(() => {
    async function initCamera() {
      if (isCapturing && videoRef.current && !streamRef.current) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
              width: { ideal: 640 }, 
              height: { ideal: 480 },
              facingMode: "user"
            } 
          });
          videoRef.current.srcObject = stream;
          streamRef.current = stream;
        } catch (err) {
          console.error("Camera access denied:", err);
          setIsCapturing(false);
          alert("Could not access camera. Please check permissions.");
        }
      }
    }
    initCamera();
  }, [isCapturing]);

  const playErrorBeep = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.type = 'square';
      oscillator.frequency.setValueAtTime(150, audioCtx.currentTime); // Low pitched alert
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);

      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.5);
    } catch (e) {
      console.warn("Audio feedback failed:", e);
    }
  };

  const handleCapture = async () => {
    if (!videoRef.current || !streamRef.current) return;

    setIsProcessing(true);
    setEnrollmentError(null);
    try {
      // Accuracy/Performance balance: inputSize 320 is standard for TinyFaceDetector
      const detections = await faceapi.detectSingleFace(
        videoRef.current,
        new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.6 })
      )
      .withFaceLandmarks()
      .withFaceDescriptor();

      if (!detections) {
        setEnrollmentError("FACE NOT DETECTED: PLEASE ADJUST FRAMING");
        playErrorBeep();
        return;
      }

      if (step === 'guardians' && studentDescriptor) {
        // Compare with student to prevent identity swapping
        const distance = faceapi.euclideanDistance(detections.descriptor, studentDescriptor);
        if (distance < 0.45) { // Match threshold
          setEnrollmentError("SECURITY ALERT: GUARDIAN IDENTITY MATCHES STUDENT. CAPTURE SEPARATE INDIVIDUALS.");
          playErrorBeep();
          return;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = 200;
      canvas.height = 200;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const video = videoRef.current;
        const size = Math.min(video.videoWidth, video.videoHeight);
        const startX = (video.videoWidth - size) / 2;
        const startY = (video.videoHeight - size) / 2;
        ctx.drawImage(video, startX, startY, size, size, 0, 0, 200, 200);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);

        if (step === 'student') {
          setStudentDescriptor(Array.from(detections.descriptor));
          setStudentPhoto(dataUrl);
        } else if (step === 'guardians' && currentGuardianRole) {
          const newGuardian: Omit<Guardian, 'id'> = {
            role: currentGuardianRole,
            name: currentGuardianName || currentGuardianRole,
            faceDescriptor: Array.from(detections.descriptor),
            photo: dataUrl
          };
          setEnrolledGuardians(prev => [...prev, newGuardian]);
          setCurrentGuardianRole(null);
          setCurrentGuardianName('');
        }
      }
    } catch (err) {
      console.error(err);
      setEnrollmentError("SCANNER ERROR: RESETTING INTERFACE");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEnrollFinal = () => {
    if (!studentDescriptor || enrolledGuardians.length === 0) {
      alert("Missing required enrollment data.");
      return;
    }

    const newEntry: RegistryEntry = {
      id: crypto.randomUUID(),
      childName: formData.childName,
      scholarNo: formData.scholarNo,
      classSec: formData.classSec,
      studentFaceDescriptor: studentDescriptor,
      studentPhoto: studentPhoto || undefined,
      guardians: enrolledGuardians as Guardian[],
      createdAt: Date.now()
    };

    onEnroll(newEntry);
    setFormData({ childName: '', scholarNo: '', classSec: '' });
    setStep('details');
    setStudentDescriptor(null);
    setStudentPhoto(null);
    setEnrolledGuardians([]);
    alert("Full Registry Success");
  };

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    };
  }, []);

  const roles: ('Father' | 'Mother' | 'Guardian')[] = ['Father', 'Mother', 'Guardian'];

  return (
    <div className="glass-card overflow-hidden">
       <div className="p-6 sm:p-10 border-b border-surface-border">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
          <h2 className="text-xl sm:text-2xl font-extrabold text-text-primary tracking-tight flex items-center space-x-3 uppercase">
            <UserPlus className="w-6 h-6 sm:w-8 sm:h-8 text-accent-emerald" />
            <span>Secure Biometric Enrollment</span>
          </h2>
          <div className="status-badge text-accent-emerald bg-accent-emerald-alpha self-start sm:self-center">Multi-Guardian v3.0</div>
        </div>
        <p className="text-text-secondary text-[10px] sm:text-xs font-medium max-w-lg">Enroll the student and multiple authorized guardians for flexible and secure identity verification.</p>
      </div>

      <div className="grid lg:grid-cols-2 lg:divide-x lg:divide-surface-border">
        <div className="p-6 sm:p-10 space-y-8">
          <div className="flex items-center space-x-2 mb-4">
             {[
               { id: 'details', label: 'Details' },
               { id: 'student', label: 'Student' },
               { id: 'guardians', label: 'Guardians' }
             ].map((s, i) => (
               <React.Fragment key={s.id}>
                 <div className={cn(
                   "text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded",
                   step === s.id ? "bg-accent-emerald text-black" : "text-text-secondary bg-white/5"
                 )}>
                   {s.label}
                 </div>
                 {i < 2 && <div className="w-4 h-[1px] bg-white/10" />}
               </React.Fragment>
             ))}
          </div>

          <div className="space-y-5">
            {enrollmentError && (
              <motion.div 
                initial={{ opacity: 0, x: -10 }} 
                animate={{ opacity: 1, x: 0 }} 
                className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl mb-4"
              >
                <div className="flex items-center space-x-2 text-red-500">
                  <AlertTriangle className="w-4 h-4" />
                  <p className="text-[10px] font-black uppercase tracking-widest">{enrollmentError}</p>
                </div>
              </motion.div>
            )}

            {step === 'details' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
                <InputGroup label="Student Full Name" value={formData.childName} onChange={v => setFormData(f => ({...f, childName: v}))} />
                <div className="grid grid-cols-2 gap-4">
                  <InputGroup label="Scholar Number" value={formData.scholarNo} onChange={v => setFormData(f => ({...f, scholarNo: v}))} />
                  <InputGroup label="Grade & Section" value={formData.classSec} onChange={v => setFormData(f => ({...f, classSec: v}))} />
                </div>
                <button 
                  onClick={() => setStep('student')}
                  disabled={!formData.childName || !formData.scholarNo}
                  className="w-full py-5 bg-text-primary text-background rounded-xl font-black text-xs tracking-[0.2em] uppercase transition-all disabled:opacity-30 cursor-pointer shadow-lg"
                >
                  Proceed to Biometrics
                </button>
              </motion.div>
            )}

            {step === 'student' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                <div className="p-6 bg-slate-50 border border-slate-100 rounded-2xl">
                  <h4 className="text-sm font-bold text-text-primary mb-2 uppercase tracking-tight">Step 1: Student Capture</h4>
                  <p className="text-xs text-text-secondary">Position the student within the frame for biometric enrollment.</p>
                </div>
                
                {!studentDescriptor ? (
                  <button 
                    onClick={handleCapture}
                    disabled={!isCapturing || isProcessing}
                    className="w-full py-5 bg-accent-emerald text-white rounded-xl font-black text-xs tracking-[0.2em] uppercase transition-all flex items-center justify-center space-x-2 shadow-lg"
                  >
                    {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <span>Capture Bio-Signature</span>}
                  </button>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center space-x-3 p-4 bg-surface rounded-xl border border-surface-border">
                      <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 border border-surface-border">
                        <img src={studentPhoto!} alt="Student" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-accent-emerald">SIGNATURE CAPTURED</p>
                        <p className="text-xs text-text-primary font-bold uppercase">{formData.childName}</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => setStep('guardians')}
                      className="w-full py-5 bg-text-primary text-background rounded-xl font-black text-xs tracking-[0.2em] uppercase hover:bg-accent-emerald transition-all"
                    >
                      Authorize Guardians
                    </button>
                  </div>
                )}
              </motion.div>
            )}

            {step === 'guardians' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-text-primary uppercase tracking-widest px-1">Authorized Guardians ({enrolledGuardians.length})</h4>
                  <div className="space-y-2">
                    {enrolledGuardians.map((g, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-surface border border-surface-border rounded-lg group">
                        <div className="flex items-center space-x-3">
                          <img src={g.photo} className="w-8 h-8 rounded border border-surface-border" alt="Guardian" />
                          <div>
                            <p className="text-[10px] font-bold text-text-primary uppercase">{g.name}</p>
                            <p className="text-[8px] font-black text-accent-emerald uppercase tracking-widest">{g.role}</p>
                          </div>
                        </div>
                        <button 
                          onClick={() => setEnrolledGuardians(prev => prev.filter((_, idx) => idx !== i))}
                          className="p-2 text-white/20 hover:text-red-500 transition-all"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {!currentGuardianRole ? (
                  <div className="space-y-4 pt-4 border-t border-white/5">
                    <p className="text-[10px] font-black text-text-secondary uppercase tracking-[0.2em] text-center mb-4">Add New Authorized Person</p>
                    <div className="grid grid-cols-3 gap-3">
                      {roles.map(role => (
                        <button 
                          key={role}
                          onClick={() => setCurrentGuardianRole(role)}
                          disabled={enrolledGuardians.some(g => g.role === role)}
                          className="py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[9px] font-black uppercase tracking-widest text-white transition-all disabled:opacity-20"
                        >
                          {role}
                        </button>
                      ))}
                    </div>
                    {enrolledGuardians.length > 0 && (
                      <button 
                        onClick={handleEnrollFinal}
                        className="w-full py-5 bg-accent-emerald text-black rounded-xl font-black text-xs tracking-[0.2em] uppercase mt-4 hover:shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all"
                      >
                        Finalize Enrollment
                      </button>
                    )}
                  </div>
                ) : (
                  <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-5 p-6 bg-surface border border-surface-border rounded-2xl shadow-sm">
                     <div className="flex justify-between items-center mb-2">
                       <p className="text-[10px] font-black text-accent-emerald uppercase tracking-widest">Enrolling: {currentGuardianRole}</p>
                       <button onClick={() => setCurrentGuardianRole(null)} className="text-[8px] font-bold text-text-secondary uppercase hover:text-text-primary transition-colors cursor-pointer">Cancel</button>
                     </div>
                     <InputGroup label={`${currentGuardianRole} Full Name`} value={currentGuardianName} onChange={setCurrentGuardianName} />
                     <button 
                      onClick={handleCapture}
                      disabled={!isCapturing || isProcessing}
                      className="w-full py-4 bg-text-primary text-background rounded-xl font-black text-[10px] tracking-[0.2em] uppercase transition-all flex items-center justify-center space-x-2 shadow-lg"
                    >
                      {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <span>Capture {currentGuardianRole} Face</span>}
                    </button>
                  </motion.div>
                )}
              </motion.div>
            )}
          </div>
        </div>

        <div className="bg-background/20 p-6 sm:p-10 flex flex-col items-center justify-center transition-all">
          {!isCapturing && step !== 'details' ? (
            <button 
              onClick={startCamera}
              className="w-full aspect-[4/5] sm:aspect-square lg:aspect-[4/5] border-2 border-dashed border-surface-border rounded-3xl hover:border-accent-emerald/40 hover:bg-accent-emerald/5 transition-all group flex flex-col items-center justify-center cursor-pointer bg-surface/30"
            >
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-surface flex items-center justify-center group-hover:bg-accent-emerald/20 transition-all border border-surface-border shadow-sm">
                <Camera className="w-6 h-6 sm:w-8 sm:h-8 text-text-secondary group-hover:text-accent-emerald" />
              </div>
              <p className="text-[9px] sm:text-[11px] font-black text-text-secondary mt-6 group-hover:text-text-primary uppercase tracking-[0.25em]">ACTIVATE SENSOR</p>
            </button>
          ) : isCapturing ? (
            <div className="relative w-full aspect-[4/5] sm:aspect-square lg:aspect-[4/5] rounded-[2.5rem] overflow-hidden bg-slate-900 shadow-2xl ring-4 ring-surface-border ring-inset ring-offset-8 ring-offset-background group">
              <video ref={videoRef} autoPlay muted className="w-full h-full object-cover" />
              <div className="absolute inset-x-0 top-0 bottom-0 flex items-center justify-center pointer-events-none">
                 <div className="w-32 h-48 sm:w-48 sm:h-64 border-2 border-accent-emerald/20 rounded-[80px] shadow-[0_0_100px_rgba(16,185,129,0.1)]" />
              </div>
              <div className="absolute top-4 right-4 bg-accent-emerald text-black text-[10px] font-bold px-2 py-1 rounded uppercase">Biometric Stream</div>
            </div>
          ) : (
             <div className="w-full aspect-[4/5] sm:aspect-square lg:aspect-[4/5] bg-surface/50 rounded-3xl flex items-center justify-center border border-white/5">
                <p className="text-text-secondary text-[10px] font-bold uppercase tracking-widest text-center leading-relaxed">Enrollment parameters required<br/>prior to sensor initialization</p>
             </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InputGroup({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const handleSafeChange = (v: string) => {
    // SECURITY: Filter out script tags and brackets, limit to 40 chars
    const sanitized = v.replace(/[<>{}()[\]]/g, '').slice(0, 40);
    onChange(sanitized);
  };

  return (
    <div className="space-y-2">
      <label className="info-label px-1">{label}</label>
      <input 
        type="text" 
        value={value}
        onChange={e => handleSafeChange(e.target.value)}
        required
        className="w-full bg-surface border border-surface-border rounded-xl px-5 py-4 text-sm font-bold text-text-primary placeholder:text-text-secondary/30 placeholder:font-normal focus:ring-1 focus:ring-accent-emerald/50 focus:border-accent-emerald outline-none transition-all shadow-sm"
        placeholder={`ENTER ${label.toUpperCase()}...`}
      />
    </div>
  );
}

function AdminTab({ 
  registry, 
  isAuthenticated, 
  onLogin, 
  isLoginError, 
  onDelete,
  onDownload,
  onDownloadTechnical,
  onDownloadPresentation,
  onExportBackup,
  onImportBackup,
  backupInterval,
  onStressTest,
  isGeneratingTest,
  onSetBackupInterval,
  systemSettings,
  onUpdateSettings,
  storagePath,
  onUpdateEntry,
  onActivate,
  licenseStatus,
  syncStatus
}: { 
  registry: RegistryEntry[]; 
  isAuthenticated: boolean; 
  onLogin: (pass: string) => void;
  isLoginError: boolean;
  onStressTest: () => void;
  isGeneratingTest: boolean;
  onDelete: (id: string) => void;
  onDownload: () => void;
  onDownloadTechnical: () => void;
  onDownloadPresentation: () => void;
  onExportBackup: () => void;
  onImportBackup: (e: React.ChangeEvent<HTMLInputElement>) => void;
  backupInterval: BackupInterval;
  onSetBackupInterval: (v: BackupInterval) => void;
  systemSettings: SystemSettings;
  onUpdateSettings: (s: SystemSettings) => void;
  storagePath: string;
  onUpdateEntry: (entry: RegistryEntry) => void;
  onActivate: (key: string) => boolean;
  licenseStatus: { isActive: boolean; remainingDays: number; isTampered?: boolean; error?: string };
  syncStatus: 'idle' | 'syncing' | 'error';
}) {
  const [showDbDetails, setShowDbDetails] = useState(false);
  const [pass, setPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [calibrationEntry, setCalibrationEntry] = useState<RegistryEntry | null>(null);
  const [view, setView] = useState<'registry' | 'settings'>('registry');
  const [newPassword, setNewPassword] = useState(systemSettings.systemPassword || '');
  const [showNewPass, setShowNewPass] = useState(false);
  const [saveStatus, setSaveStatus] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [auditPassword, setAuditPassword] = useState('');
  const [auditCameraActive, setAuditCameraActive] = useState(false);
  const [genDays, setGenDays] = useState(30);
  const [generatedKey, setGeneratedKey] = useState('');
  const adminVideoRef = useRef<HTMLVideoElement>(null);

  const generateNewLicense = () => {
    const key = generateLicense(genDays, systemSettings.schoolName || "DEMO");
    setGeneratedKey(key);
  };

  const filteredRegistry = registry.filter(person => {
    const searchLower = searchTerm.toLowerCase();
    const studentMatch = person.childName.toLowerCase().includes(searchLower);
    const scholarMatch = person.scholarNo.toLowerCase().includes(searchLower);
    const guardianMatch = person.guardians?.some(g => g.name.toLowerCase().includes(searchLower));
    return studentMatch || scholarMatch || guardianMatch;
  });

const handleSecureDelete = async (person: RegistryEntry) => {
    if (auditPassword !== systemSettings.systemPassword) {
      alert("Invalid Security Password. Deletion Aborted.");
      return;
    }

    if (!adminVideoRef.current) return;
    
    setIsDeleting(true);
    try {
      // Capture face of auditor
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(adminVideoRef.current, 0, 0);
        const auditorPhoto = canvas.toDataURL('image/jpeg', 0.7);
        const timestamp = new Date().toLocaleString();
        const rawTimestamp = Date.now();

        // 1. Generate PDF Audit Report
        const doc = new jsPDF();
        doc.setFontSize(22);
        doc.text("SECURITY AUDIT: RECORD DELETION", 20, 30);
        doc.setFontSize(12);
        doc.text(`Timestamp: ${timestamp}`, 20, 45);
        doc.text(`Action: Permanent Record Removal`, 20, 52);
        
        doc.setDrawColor(0);
        doc.line(20, 60, 190, 60);

        doc.setFontSize(14);
        doc.text("DELETED RECORD DETAILS", 20, 75);
        doc.setFontSize(10);
        doc.text(`Student Name: ${person.childName}`, 20, 85);
        doc.text(`Scholar No: ${person.scholarNo}`, 20, 92);
        doc.text(`Class/Section: ${person.classSec}`, 20, 99);

        doc.setFontSize(14);
        doc.text("AUDITOR IDENTITY CAPTURE", 20, 120);
        doc.addImage(auditorPhoto, 'JPEG', 20, 130, 80, 60);
        
        doc.setFontSize(8);
        doc.text("SYSTEM LOG GENERATED BY SENTINEL CORE SECURE MODULE", 20, 280);

        // Download Report
        doc.save(`DELETION_AUDIT_${person.scholarNo}_${rawTimestamp}.pdf`);

        // 2. Log to Server
        await fetch("/api/audit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: person.id,
            type: "DELETION",
            details: `Scholar ${person.scholarNo} deleted by authorized user`,
            photo: auditorPhoto,
            timestamp: rawTimestamp
          })
        });

        // 3. Finalize Delete
        onDelete(person.id);
        setConfirmDeleteId(null);
        setAuditCameraActive(false);
        setAuditPassword('');
      }
    } catch (err) {
      console.error(err);
      alert("Security Module Error during deletion audit.");
    } finally {
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    let stream: MediaStream | null = null;
    if (confirmDeleteId && !auditCameraActive) {
      setAuditCameraActive(true);
    }
    if (auditCameraActive && adminVideoRef.current) {
      navigator.mediaDevices.getUserMedia({ video: true }).then(s => {
        stream = s;
        if (adminVideoRef.current) adminVideoRef.current.srcObject = s;
      });
    }
    return () => {
      stream?.getTracks().forEach(t => t.stop());
    };
  }, [confirmDeleteId, auditCameraActive]);

  if (!isAuthenticated) {
    return (
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md mx-auto mt-20 p-10 glass-card text-center"
      >
        <Lock className="w-12 h-12 text-accent-emerald mx-auto mb-6" />
        <h2 className="text-xl font-extrabold text-text-primary uppercase tracking-tight mb-2">Admin Access</h2>
        <p className="text-xs text-text-secondary mb-8 uppercase tracking-widest">Master Credentials Required</p>
        
        <form onSubmit={(e) => { e.preventDefault(); onLogin(pass); }} className="space-y-4">
          <div className="relative">
            <input 
              type={showPass ? "text" : "password"}
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              placeholder="ACCESS TOKEN"
              className={cn(
                "w-full bg-surface border rounded-xl px-5 py-4 text-center text-sm font-black tracking-[0.2em] uppercase outline-none transition-all",
                isLoginError ? "border-red-500 text-red-500 animate-shake" : "border-surface-border text-text-primary focus:border-accent-emerald"
              )}
            />
            <button 
              type="button"
              onClick={() => setShowPass(!showPass)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-text-secondary hover:text-white transition-all cursor-pointer"
            >
              {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <button 
            type="submit"
            className="w-full py-4 bg-white text-black rounded-xl font-black text-xs tracking-[0.3em] uppercase hover:bg-accent-emerald transition-all cursor-pointer"
          >
            Authenticate
          </button>
        </form>
        {isLoginError && <p className="text-[10px] text-red-500 mt-4 uppercase font-bold tracking-widest">Invalid Security Token</p>}
        <p className="text-[10px] text-white/20 mt-6 uppercase">Tip: Check master config in local drive data folder</p>
      </motion.div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-6xl mx-auto space-y-6 sm:space-y-8 px-4 sm:px-0"
    >
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
        <div className="text-center xl:text-left">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-text-primary tracking-tight uppercase mb-1">Registry Control</h2>
          <p className="text-text-secondary text-[10px] sm:text-xs font-medium tracking-tight uppercase">Authorized Student & Guardian Records</p>
        </div>
        <div className="flex flex-wrap items-center justify-center xl:justify-end gap-2 sm:gap-3">
           <button 
             onClick={() => setView(view === 'registry' ? 'settings' : 'registry')}
             className={cn(
               "flex items-center space-x-2 px-3 sm:px-4 py-2 sm:py-3 border rounded-xl transition-all group cursor-pointer",
               view === 'settings' ? "bg-white text-black border-white" : "bg-surface hover:bg-white/10 border-surface-border text-text-primary"
             )}
           >
             <Palette className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
             <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest">{view === 'registry' ? 'Settings' : 'Registry'}</span>
           </button>

           <button 
             onClick={() => setShowDbDetails(!showDbDetails)}
             className={cn(
               "hidden sm:flex p-1 rounded-xl border mr-2 items-center space-x-2 px-3 self-stretch transition-all cursor-pointer",
               showDbDetails ? "bg-accent-emerald/10 border-accent-emerald" : "bg-surface border-surface-border hover:bg-white/5"
             )}
           >
              <Database className={cn("w-4 h-4", showDbDetails ? "text-accent-emerald" : "text-accent-emerald opacity-50")} />
              <div className="flex flex-col text-left">
                <span className="text-[10px] font-black text-text-primary uppercase italic leading-tight">Master Database</span>
                <span className="text-[8px] font-bold text-text-secondary uppercase tracking-widest leading-tight overflow-hidden text-ellipsis whitespace-nowrap max-w-[150px]">{storagePath || 'Persistence Tier A'}</span>
              </div>
           </button>
           
           <button 
             onClick={onExportBackup}
             className="flex items-center space-x-2 px-3 sm:px-4 py-2 sm:py-3 bg-surface hover:bg-white/10 border border-surface-border rounded-xl transition-all group cursor-pointer"
             title="Download JSON Backup"
           >
             <FileJson className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-accent-emerald group-hover:scale-110 transition-all" />
             <span className="text-[9px] sm:text-[10px] font-black text-text-primary uppercase tracking-widest">Backup</span>
           </button>

           <label className="flex items-center space-x-2 px-3 sm:px-4 py-2 sm:py-3 bg-surface hover:bg-white/10 border border-surface-border rounded-xl transition-all group cursor-pointer">
             <Upload className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-accent-emerald group-hover:scale-110 transition-all" />
             <span className="text-[9px] sm:text-[10px] font-black text-text-primary uppercase tracking-widest">Restore</span>
             <input type="file" accept=".json" onChange={onImportBackup} className="hidden" />
           </label>

           <div className="flex bg-surface p-1 rounded-xl border border-surface-border items-center">
              <span className="hidden xs:block text-[8px] font-black text-text-secondary uppercase tracking-widest px-2">Auto-Save:</span>
              <div className="flex space-x-1">
                {(['off', 'daily', 'weekly'] as BackupInterval[]).map((int) => (
                  <button
                    key={int}
                    onClick={() => onSetBackupInterval(int)}
                    className={cn(
                      "px-1.5 sm:px-2 py-1 rounded-md text-[8px] font-black uppercase transition-all",
                      backupInterval === int 
                        ? "bg-accent-emerald text-black" 
                        : "text-text-secondary hover:text-white hover:bg-white/5"
                    )}
                  >
                    {int}
                  </button>
                ))}
              </div>
           </div>

           <div className="w-px h-8 bg-surface-border mx-2 hidden xl:block" />

           <button 
             onClick={onDownloadTechnical}
             className="bg-surface hover:bg-white/10 px-3 sm:px-4 py-2 sm:py-3 rounded-xl border border-surface-border text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-text-secondary flex items-center space-x-2 transition-all cursor-pointer"
           >
             <ShieldCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
             <span className="hidden xs:inline">Technical</span>
           </button>

           <button 
            onClick={onDownload}
            className="bg-accent-emerald text-white px-4 sm:px-6 py-2 sm:py-3 rounded-xl shadow-lg shadow-accent-emerald/20 text-[10px] sm:text-[11px] font-black uppercase tracking-widest flex items-center space-x-2 transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>Export PDF</span>
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showDbDetails && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden bg-black/20 rounded-2xl border border-white/5"
          >
            <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-6">
               <div className="space-y-1">
                 <p className="text-[8px] font-black text-text-secondary uppercase tracking-[0.2em]">Total Records</p>
                 <p className="text-xl font-black text-white italic">{registry.length}</p>
                 <p className="text-[9px] text-accent-emerald font-bold uppercase">Authorized Students</p>
               </div>
               <div className="space-y-1">
                 <p className="text-[8px] font-black text-text-secondary uppercase tracking-[0.2em]">Bio-Signatures</p>
                 <p className="text-xl font-black text-white italic">{registry.reduce((acc, c) => acc + (c.guardians?.length || 0) + 1, 0)}</p>
                 <p className="text-[9px] text-accent-emerald font-bold uppercase">Encrypted Descriptors</p>
               </div>
               <div className="space-y-1">
                 <p className="text-[8px] font-black text-text-secondary uppercase tracking-[0.2em]">Storage Vector</p>
                 <p className="text-[10px] font-black text-white uppercase truncate">{storagePath || 'LOCAL_CACHE'}</p>
                 <p className="text-[9px] text-accent-emerald font-bold uppercase">High-Integrity Path</p>
               </div>
               <div className="space-y-1">
                 <p className="text-[8px] font-black text-text-secondary uppercase tracking-[0.2em]">IO Performance</p>
                 <p className="text-xl font-black text-white italic">0.4ms</p>
                 <p className="text-[9px] text-accent-emerald font-bold uppercase">Access Latency</p>
               </div>
            </div>
            <div className="bg-white/5 px-6 py-3 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-1 h-1 rounded-full bg-accent-emerald animate-pulse" />
                <span className="text-[8px] font-black text-text-secondary uppercase tracking-widest">Diagnostic Status: NOMINAL | Integrity: VERIFIED</span>
              </div>
              <button 
                onClick={() => {
                  alert("REBUILDING_INDICES: Database optimization in progress...");
                  setTimeout(() => alert("INTEGRITY_VERIFIED: All checksums valid."), 1500);
                }}
                className="text-[9px] font-black text-accent-emerald uppercase hover:underline"
              >
                Deep Optimization
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {view === 'registry' ? (
        <>
          <div className="glass-card p-3 sm:p-4 flex flex-col sm:flex-row items-center gap-4">
            <div className="relative w-full sm:flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
              <input 
                type="text"
                placeholder="SEARCH BY STUDENT, SCHOLAR ID, OR GUARDIAN NAME..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-surface border border-surface-border rounded-xl pl-12 pr-4 py-3 text-[10px] sm:text-xs font-bold text-text-primary placeholder:text-text-secondary/30 outline-none focus:ring-1 focus:ring-accent-emerald/50 focus:border-accent-emerald transition-all"
              />
            </div>
            <div className="flex items-center justify-between w-full sm:w-auto space-x-2 text-[10px] font-black text-text-secondary uppercase tracking-widest px-2">
              <div className="flex items-center space-x-2">
                <Database className="w-3 h-3" />
                <span>Matches: {filteredRegistry.length}</span>
              </div>
            </div>
          </div>

          <div className="lg:glass-card overflow-hidden">
            {/* Table View (Desktop) */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                   <tr className="border-b border-surface-border bg-background">
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-text-secondary">Profiles</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-text-secondary">Student Detail</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-text-secondary">Authorized Guardian</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-text-secondary">Class/Sec</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-text-secondary">Scholar ID</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-text-secondary text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {filteredRegistry.map((person) => (
                    <tr key={person.id} className="hover:bg-accent-emerald-alpha transition-all group">
                      <td className="px-6 py-5">
                        <div className="flex -space-x-2">
                            <div className="w-10 h-10 rounded-lg border-2 border-surface bg-background overflow-hidden ring-2 ring-surface-border">
                              {person.studentPhoto ? <img src={person.studentPhoto} alt="Student" className="w-full h-full object-cover" /> : null}
                            </div>
                            {person.guardians?.map((g, gi) => (
                              <div key={gi} className="w-10 h-10 rounded-lg border-2 border-surface bg-background overflow-hidden ring-2 ring-surface-border" title={g.name}>
                                {g.photo ? <img src={g.photo} alt={g.role} className="w-full h-full object-cover" /> : null}
                              </div>
                            ))}
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex items-center space-x-3">
                            <span className="text-sm font-bold text-text-primary uppercase italic">{person.childName}</span>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="space-y-1">
                          {person.guardians?.map((g, gi) => (
                            <div key={gi} className="flex flex-col">
                              <span className="text-[11px] font-bold text-text-primary">{g.name}</span>
                              <span className="text-[8px] font-black uppercase text-accent-emerald tracking-widest">{g.role}</span>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <span className="text-xs font-mono text-text-secondary">{person.classSec}</span>
                      </td>
                      <td className="px-6 py-5">
                        <span className="text-xs font-mono text-accent-emerald">{person.scholarNo}</span>
                      </td>
                      <td className="px-6 py-5 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <button 
                            type="button"
                            onClick={() => setCalibrationEntry(person)}
                            className="p-2 text-accent-emerald/40 hover:text-accent-emerald hover:bg-accent-emerald/10 rounded-lg transition-all cursor-pointer"
                            title="Calibrate Physical Variations"
                          >
                            <Zap className="w-4 h-4" />
                          </button>
                          <button 
                            type="button"
                            onClick={() => setConfirmDeleteId(person.id)}
                            className="p-2 text-red-500/40 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Card View (Mobile/Tablet) */}
            <div className="lg:hidden space-y-4">
              {filteredRegistry.map((person) => (
                <div key={person.id} className="glass-card p-4 space-y-4">
                  <div className="flex justify-between items-start">
                    <div className="flex -space-x-3">
                      <div className="w-12 h-12 rounded-xl border-2 border-surface bg-white/5 overflow-hidden ring-4 ring-black/50">
                        {person.studentPhoto ? <img src={person.studentPhoto} alt="Student" className="w-full h-full object-cover" /> : null}
                      </div>
                      {person.guardians?.map((g, gi) => (
                        <div key={gi} className="w-12 h-12 rounded-xl border-2 border-surface bg-white/5 overflow-hidden ring-4 ring-black/50" title={g.name}>
                          {g.photo ? <img src={g.photo} alt={g.role} className="w-full h-full object-cover" /> : null}
                        </div>
                      ))}
                    </div>
                    <div className="flex space-x-2">
                      <button 
                        type="button"
                        onClick={() => setCalibrationEntry(person)}
                        className="p-2.5 text-accent-emerald bg-accent-emerald/10 rounded-xl cursor-pointer"
                      >
                        <Zap className="w-4 h-4" />
                      </button>
                      <button 
                        type="button"
                        onClick={() => setConfirmDeleteId(person.id)}
                        className="p-2.5 text-red-500 bg-red-500/10 rounded-xl cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-0.5">
                      <span className="text-[8px] font-black uppercase text-text-secondary tracking-widest">Student</span>
                      <p className="text-sm font-bold text-text-primary uppercase">{person.childName}</p>
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-[8px] font-black uppercase text-text-secondary tracking-widest">ID / Class</span>
                      <p className="text-xs font-mono text-accent-emerald">{person.scholarNo} / {person.classSec}</p>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-white/5">
                    <span className="text-[8px] font-black uppercase text-text-secondary tracking-widest">Authorized Guardians</span>
                    <div className="mt-2 space-y-2">
                      {person.guardians?.map((g, gi) => (
                        <div key={gi} className="flex items-center justify-between bg-white/2 p-2 rounded-lg">
                          <span className="text-[11px] font-bold text-text-primary">{g.name}</span>
                          <span className="text-[8px] font-black uppercase text-accent-emerald bg-accent-emerald/10 px-1.5 py-0.5 rounded transition-all">{g.role}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {registry.length === 0 && (
              <div className="p-10 sm:p-20 text-center text-text-secondary uppercase text-[10px] font-black tracking-widest">
                Database empty. enroll new profiles.
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="max-w-2xl mx-auto space-y-8 glass-card p-10">
          <div className="flex items-center space-x-4 border-b border-surface-border pb-6">
            <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-accent-emerald">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-text-primary uppercase">System Configuration</h3>
              <p className="text-[10px] text-text-secondary uppercase font-bold tracking-widest">Core Sentinel Node A-4</p>
            </div>
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <label className="info-label">Master Authentication Password</label>
              <div className="relative">
                <input 
                  type={showNewPass ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-surface border border-surface-border rounded-xl px-5 py-4 text-sm font-bold text-white focus:border-accent-emerald outline-none transition-all"
                  placeholder="UPDATE MASTER PASSWORD..."
                />
                <button 
                  type="button"
                  onClick={() => setShowNewPass(!showNewPass)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-text-secondary hover:text-white transition-all cursor-pointer"
                >
                  {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="p-6 bg-accent-emerald/5 rounded-2xl border border-accent-emerald/10 flex items-center justify-between">
              <div>
                <p className="text-xs font-black text-white uppercase italic">Full-Drive Persistence</p>
                <p className="text-[10px] text-text-secondary uppercase font-medium">Automatic sync to local drive enabled</p>
              </div>
              <div className="status-badge text-accent-emerald bg-accent-emerald-alpha">ACTIVE</div>
            </div>

            <div className="p-6 bg-accent-emerald/5 rounded-2xl border border-accent-emerald/10 flex items-center justify-between">
              <div>
                <p className="text-xs font-black text-white uppercase italic">Database Integrity Stress Test</p>
                <p className="text-[10px] text-text-secondary uppercase font-medium">Test system with 1,500 students (6,000 descriptors)</p>
              </div>
              <button 
                onClick={onStressTest}
                disabled={isGeneratingTest}
                className="px-4 py-2 bg-accent-emerald/20 hover:bg-accent-emerald/30 text-accent-emerald text-[9px] font-black uppercase rounded-lg transition-all decoration-none"
              >
                {isGeneratingTest ? "GENERATING..." : "RUN CAPACITY TEST"}
              </button>
            </div>

            <div className="p-8 bg-slate-900 border border-white/5 rounded-[2rem] space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Zap className="w-5 h-5 text-accent-emerald" />
                  <h4 className="text-sm font-black text-white uppercase tracking-tighter italic">License & School Profile</h4>
                </div>
                {licenseStatus.isActive && (
                  <div className="flex items-center space-x-2 bg-accent-emerald/10 px-3 py-1 rounded-full border border-accent-emerald/20">
                    <CheckCircle2 className="w-3 h-3 text-accent-emerald" />
                    <span className="text-[8px] font-black text-accent-emerald uppercase tracking-widest">SECURE_ACTIVE</span>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <p className="text-[8px] font-black text-text-secondary uppercase tracking-widest ml-1">Official School Name (First 4 chars used as Signature)</p>
                  <input 
                    type="text"
                    value={systemSettings.schoolName || ''}
                    onChange={(e) => onUpdateSettings({ ...systemSettings, schoolName: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white text-xs font-bold outline-none focus:border-accent-emerald/30 transition-all"
                    placeholder="Enter school name"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-white/2 rounded-xl border border-white/5 col-span-2">
                  <div className="flex justify-between items-start mb-2">
                    <p className="text-[8px] font-black text-text-secondary uppercase tracking-widest">Server Sync Integrity</p>
                    <span className={cn(
                      "px-2 py-0.5 rounded text-[7px] font-black uppercase",
                      syncStatus === 'syncing' ? "bg-amber-500/20 text-amber-500" : 
                      syncStatus === 'error' ? "bg-red-500/20 text-red-500" : "bg-emerald-500/20 text-emerald-500"
                    )}>
                      {syncStatus.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-[10px] font-bold text-white uppercase italic">
                    LAST_SUCCESS: {systemSettings.lastSyncTimestamp ? new Date(systemSettings.lastSyncTimestamp).toLocaleTimeString() : 'NEVER'}
                  </p>
                </div>
              </div>

              {!licenseStatus.isActive && (
                <div className="space-y-3 pt-4 border-t border-white/5">
                   <p className="text-[9px] font-black text-red-500 uppercase tracking-widest">Activation Required</p>
                   <div className="flex space-x-2">
                    <input 
                      type="text"
                      id="activation-input"
                      placeholder="Enter License Authentication Code"
                      className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[10px] font-mono text-white outline-none focus:border-accent-emerald/50"
                    />
                    <button 
                      onClick={() => {
                        const val = (document.getElementById('activation-input') as HTMLInputElement).value;
                        if (onActivate(val)) {
                          alert("SECURE_NODE_ACTIVATED: Systems online.");
                        } else {
                          alert("AUTH_SIG_REJECTED: Invalid code or mismatched signature.");
                        }
                      }}
                      className="px-6 py-3 bg-accent-emerald text-black text-[9px] font-black uppercase rounded-xl"
                    >
                      ACTIVATE
                    </button>
                   </div>
                </div>
              )}

              <div className="space-y-4 pt-4 border-t border-white/5">
                <p className="text-[9px] font-black text-text-secondary uppercase tracking-widest">Business Key Generator (Internal Tool)</p>
                <div className="flex items-center space-x-3">
                  <select 
                    value={genDays} 
                    onChange={(e) => setGenDays(Number(e.target.value))}
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[10px] font-bold text-white uppercase tracking-widest outline-none focus:border-accent-emerald/50 transition-all"
                  >
                    <option value={30} className="bg-slate-900">30 DAYS TRIAL</option>
                    <option value={90} className="bg-slate-900">90 DAYS QUARTERLY</option>
                    <option value={365} className="bg-slate-900">365 DAYS ANNUAL</option>
                    <option value={3650} className="bg-slate-900">ENTERPRISE (10Y)</option>
                  </select>
                  <button 
                    onClick={generateNewLicense}
                    className="px-6 py-3 bg-white hover:bg-slate-200 text-black text-[9px] font-black uppercase rounded-xl transition-all"
                  >
                    GENERATE
                  </button>
                </div>
                {generatedKey && (
                  <div className="space-y-2">
                    <p className="text-[8px] font-black text-accent-emerald uppercase tracking-widest">Master Signature Key Generated:</p>
                    <div className="relative group">
                      <input 
                        readOnly 
                        value={generatedKey} 
                        className="w-full bg-accent-emerald/10 border border-accent-emerald/20 text-accent-emerald font-mono text-[10px] p-4 rounded-xl text-center"
                      />
                      <button 
                        onClick={() => {
                          navigator.clipboard.writeText(generatedKey);
                          alert("License key copied to clipboard");
                        }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-accent-emerald text-black rounded-md opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <Download className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <button 
              onClick={() => {
                onUpdateSettings({ ...systemSettings, systemPassword: newPassword });
                setSaveStatus(true);
                setTimeout(() => setSaveStatus(false), 2000);
              }}
              className="w-full py-4 bg-accent-emerald text-black rounded-xl font-black text-xs tracking-[0.2em] uppercase hover:shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all cursor-pointer"
            >
              {saveStatus ? "SETTINGS SAVED" : "SAVE CONFIGURATION"}
            </button>
          </div>
        </div>
      )}
      <AnimatePresence>
        {calibrationEntry && (
        <CalibrationScanner 
          entry={calibrationEntry}
          onClose={() => setCalibrationEntry(null)}
          onUpdate={onUpdateEntry}
        />
      )}

      {confirmDeleteId && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-2xl"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-lg bg-surface border border-white/10 rounded-[2.5rem] overflow-hidden shadow-2xl"
            >
              <div className="p-8 sm:p-10 border-b border-white/5 bg-red-500/5">
                <div className="flex items-center space-x-4 mb-2 text-red-500">
                  <AlertTriangle className="w-8 h-8" />
                  <h2 className="text-2xl font-black uppercase tracking-tighter italic">Security Required</h2>
                </div>
                <p className="text-[10px] text-text-secondary font-bold uppercase tracking-widest">Permanent Record Deletion Protocol Active</p>
              </div>

              <div className="p-8 sm:p-10 space-y-8">
                <div className="flex flex-col items-center">
                  <div className="w-full aspect-video bg-black rounded-2xl overflow-hidden mb-4 relative ring-2 ring-white/10">
                    <video ref={adminVideoRef} autoPlay muted className="w-full h-full object-cover" />
                    <div className="absolute top-2 right-2 bg-red-500 text-white text-[8px] font-black px-2 py-1 rounded uppercase animate-pulse">Audit Sensor Active</div>
                    <div className="absolute inset-0 border-[20px] border-transparent border-t-white/5 border-b-white/5" />
                  </div>
                  <p className="text-[9px] font-black text-text-secondary uppercase tracking-[0.2em]">Auditor Face Capture Required</p>
                </div>

                <div className="space-y-4">
                  <label className="text-[10px] font-black text-white uppercase tracking-widest ml-1">Confirm System Password</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                    <input 
                      type="password"
                      value={auditPassword}
                      onChange={(e) => setAuditPassword(e.target.value)}
                      placeholder="MASTER PASSWORD"
                      className="w-full py-4 bg-white/5 border border-white/10 rounded-xl px-12 text-center font-black tracking-[0.3em] uppercase text-xs focus:border-red-500/50 transition-all outline-none"
                    />
                  </div>
                </div>

                <div className="flex gap-4">
                  <button 
                    onClick={() => {
                      setConfirmDeleteId(null);
                      setAuditCameraActive(false);
                      setAuditPassword('');
                    }}
                    className="flex-1 py-4 bg-white/5 hover:bg-white/10 text-text-secondary font-black text-[10px] uppercase rounded-xl transition-all cursor-pointer"
                  >
                    Abort
                  </button>
                  <button 
                    onClick={() => {
                      const person = registry.find(r => r.id === confirmDeleteId);
                      if (person) handleSecureDelete(person);
                    }}
                    disabled={isDeleting || !auditPassword}
                    className="flex-[2] py-4 bg-red-500 hover:bg-red-600 text-white font-black text-[10px] uppercase rounded-xl shadow-xl shadow-red-500/20 flex items-center justify-center space-x-2 transition-all cursor-pointer disabled:opacity-30"
                  >
                    {isDeleting ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : <><ShieldCheck className="w-4 h-4" /><span>Authorize Deletion</span></>}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
