/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import * as faceapi from 'face-api.js';
import { 
  Camera, UserPlus, ShieldCheck, History, Loader2, Search, 
  CheckCircle2, UserCircle, Download, Trash2, Lock,
  Sun, Moon, Palette, Upload, Database, FileJson, AlertTriangle, Eye, EyeOff,
  Zap, Activity
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { io, Socket } from 'socket.io-client';
import { cn } from './lib/utils';
import { RegistryEntry, PickupLog, Guardian } from './types.ts';
import { exportLogsToPDF, exportRegistryToPDF, exportTechnicalDoc, exportPresentationDoc } from './lib/pdfExport';

// Constants
const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';
const REGISTRY_STORAGE_KEY = 'guardlink_registry_v3';
const HISTORY_STORAGE_KEY = 'guardlink_history_v3';
const ACCENT_STORAGE_KEY = 'guardlink_accent';
const BACKUP_INTERVAL_KEY = 'guardlink_backup_interval';
const LAST_BACKUP_KEY = 'guardlink_last_backup_time';

interface SystemSettings {
  systemPassword?: string;
  backupEnabled?: boolean;
}

type Accent = 'emerald' | 'blue' | 'purple' | 'amber' | 'rose';
type BackupInterval = 'off' | 'daily' | 'weekly';

export default function App() {
  const [isModelsLoaded, setIsModelsLoaded] = useState(false);
  const [registry, setRegistry] = useState<RegistryEntry[]>([]);
  const [activeTab, setActiveTab] = useState<'scan' | 'register' | 'history' | 'admin'>('scan');
  const [laneStates, setLaneStates] = useState<{
    [key: number]: {
      matchedEntry: RegistryEntry | null;
      matchStatus: { guardian: boolean; student: boolean; guardianIndex?: number };
    }
  }>({
    1: { matchedEntry: null, matchStatus: { guardian: false, student: false } },
    2: { matchedEntry: null, matchStatus: { guardian: false, student: false } },
    3: { matchedEntry: null, matchStatus: { guardian: false, student: false } },
  });
  const [selectedSlot, setSelectedSlot] = useState<number>(1);
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
  const [assignedDevices, setAssignedDevices] = useState<{ [key: number]: string }>({});
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('sentinel-theme');
    return (saved as 'light' | 'dark') || 'dark';
  });
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

    async function getDevices() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true }); // Request permission first
        const devices = await navigator.mediaDevices.enumerateDevices();
        
        // Stop the initial permission stream immediately
        stream.getTracks().forEach(track => track.stop());

        const videoDevices = devices.filter(d => d.kind === 'videoinput');
        setAvailableDevices(videoDevices);
        
        // Auto-assign if 1-3 cameras found
        const newAssigned: { [key: number]: string } = {};
        videoDevices.slice(0, 3).forEach((d, i) => {
          newAssigned[i + 1] = d.deviceId;
        });
        setAssignedDevices(newAssigned);
      } catch (err) {
        console.error("Device discovery error:", err);
      }
    }

    async function init() {
      try {
        await getDevices();
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);
        setIsModelsLoaded(true);

        // Fetch from server
        const regRes = await fetch("/api/registry");
        const regData = await regRes.json();
        if (Array.isArray(regData)) setRegistry(regData);

        const settingsRes = await fetch("/api/settings");
        const settingsData = await settingsRes.json();
        setSystemSettings(settingsData);
        
        const historyRes = await fetch("/api/history");
        const historyData = await historyRes.json();
        if (Array.isArray(historyData)) setRecentPickups(historyData);
      } catch (error) {
        console.error("Initialization error:", error);
      }
    }
    init();

    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  const syncRegistryWithServer = async (newRegistry: RegistryEntry[]) => {
    try {
      await fetch("/api/registry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newRegistry)
      });
    } catch (err) {
      console.error("Failed to sync with server:", err);
    }
  };

  const syncSettingsWithServer = async (newSettings: SystemSettings) => {
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newSettings)
      });
    } catch (err) {
      console.error("Failed to sync settings:", err);
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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-6">
          <div className="relative w-16 h-16 mx-auto">
            <Loader2 className="w-full h-full text-accent-emerald animate-spin" />
            <div className="absolute inset-0 border-2 border-white/5 rounded-full" />
          </div>
          <div className="space-y-3">
            <h1 className="text-xl font-extrabold tracking-tight uppercase text-text-primary">Initializing Sentinel</h1>
            <p className="text-text-secondary text-[10px] font-medium tracking-widest max-w-xs mx-auto uppercase opacity-60">Loading Biometric Weights...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-text-primary font-sans selection:bg-accent-emerald/30">
      {/* Navigation Bar */}
      <nav className="h-[72px] border-b border-surface-border px-6 sm:px-10 flex items-center justify-between sticky top-0 z-50 backdrop-blur-xl bg-background/80">
        <div className="flex items-center space-x-3 sm:space-x-4">
          <div className="w-10 h-10 bg-accent-emerald rounded-xl flex items-center justify-center group shadow-sm flex-shrink-0">
            <ShieldCheck className="w-6 h-6 text-white" />
          </div>
          <div className="hidden sm:block">
            <h1 className="text-sm font-extrabold tracking-tight uppercase leading-none text-text-primary">Sentinel Pickup</h1>
            <p className="text-[10px] font-medium text-text-secondary mt-1 uppercase tracking-widest opacity-70">Main Campus Entry Point</p>
          </div>
        </div>

        <div className="flex bg-surface border border-surface-border p-1 rounded-2xl shadow-sm">
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

        <div className="hidden md:flex items-center space-x-6">
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

      <main className="max-w-7xl mx-auto p-4 sm:p-6 md:p-10">
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1">
                  {[1, 2, 3].map(slot => (
                    <div key={slot} className={cn(
                      "glass-card overflow-hidden bg-slate-100 relative flex flex-col min-h-[320px] shadow-sm ring-1 ring-black/5",
                      slot === 1 && "md:col-span-2"
                    )}>
                      <Scanner 
                        registry={registry} 
                        deviceId={assignedDevices[slot]}
                        cameraLabel={`Camera Node 0${slot}`}
                        onMatch={(entry, type, guardianIndex) => {
                          const cameraLabel = `Node 0${slot}`;
                          
                          setLaneStates(prev => {
                            const lane = prev[slot];
                            const isNewEntry = !lane.matchedEntry || lane.matchedEntry.id !== entry.id;
                            
                            let newEntry = isNewEntry ? entry : lane.matchedEntry;
                            let newStatus;

                            if (isNewEntry) {
                              newStatus = {
                                guardian: type === 'guardian',
                                student: type === 'student',
                                guardianIndex: type === 'guardian' ? guardianIndex : undefined
                              };
                            } else {
                              newStatus = {
                                guardian: lane.matchStatus.guardian || type === 'guardian',
                                student: lane.matchStatus.student || type === 'student',
                                guardianIndex: type === 'guardian' ? guardianIndex : lane.matchStatus.guardianIndex
                              };
                            }

                            // Log pickup if both are verified for the FIRST time in this lane
                            if (newStatus.guardian && newStatus.student && !(lane.matchStatus.guardian && lane.matchStatus.student)) {
                              logPickup(entry, newStatus.guardianIndex!, cameraLabel);
                            }

                            return {
                              ...prev,
                              [slot]: { 
                                matchedEntry: newEntry, 
                                matchStatus: newStatus 
                              }
                            };
                          });

                          // Auto-focus this lane if it's a new match and current lane is empty
                          if (laneStates[selectedSlot].matchedEntry === null) {
                            setSelectedSlot(slot);
                          }
                        }}
                        onScanningStateChange={setIsScanning}
                      />

                      {/* Camera Selector */}
                      <div className="absolute top-4 right-4 z-20">
                        <select 
                          value={assignedDevices[slot] || ''}
                          onChange={(e) => setAssignedDevices(prev => ({...prev, [slot]: e.target.value}))}
                          className="bg-surface/90 backdrop-blur-md border border-surface-border rounded-full px-3 py-1 text-[9px] font-bold uppercase text-text-primary outline-none cursor-pointer hover:bg-surface transition-all shadow-sm"
                        >
                          <option value="">No Source</option>
                          {availableDevices.map(d => (
                            <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${d.deviceId.slice(0,4)}`}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
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
                  {/* Lane Selector Tabs */}
                  <div className="flex bg-background border border-surface-border p-1 rounded-2xl shadow-sm">
                    {[1, 2, 3].map(slot => (
                      <button
                        key={slot}
                        onClick={() => setSelectedSlot(slot)}
                        className={cn(
                          "flex-1 py-2 px-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                          selectedSlot === slot 
                            ? "bg-surface text-text-primary shadow-sm" 
                            : "text-text-secondary hover:text-text-primary"
                        )}
                      >
                        Lane {slot}
                        {laneStates[slot].matchedEntry && (
                          <span className="ml-2 w-1.5 h-1.5 bg-accent-emerald rounded-full inline-block animate-pulse" />
                        )}
                      </button>
                    ))}
                  </div>

                  <AnimatePresence mode="wait">
                    {laneStates[selectedSlot].matchedEntry ? (
                      <motion.div
                        key={`result-${selectedSlot}-${laneStates[selectedSlot].matchedEntry.id}`}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="glass-card ring-1 ring-accent-emerald/30 overflow-hidden"
                      >
                        <div className="p-6 sm:p-8 border-b border-surface-border bg-accent-emerald-alpha/5 relative overflow-hidden group">
                           <CheckCircle2 className={cn(
                             "w-24 h-24 sm:w-32 sm:h-32 absolute -right-4 -bottom-4 rotate-12 transition-all duration-500 opacity-20",
                             laneStates[selectedSlot].matchStatus.guardian && laneStates[selectedSlot].matchStatus.student ? "text-accent-emerald scale-110" : "text-text-secondary/40"
                           )} />
                           <div className="relative">
                            <div className={cn(
                               "status-badge mb-4 border-accent-emerald/20 text-[8px] sm:text-[10px]",
                               laneStates[selectedSlot].matchStatus.guardian && laneStates[selectedSlot].matchStatus.student ? "text-accent-emerald bg-accent-emerald-alpha" : "text-amber-500 bg-amber-500/10 border-amber-500/20"
                            )}>
                              {laneStates[selectedSlot].matchStatus.guardian && laneStates[selectedSlot].matchStatus.student ? "Identification Verified" : "Awaiting Pairing"}
                            </div>
                            <h3 className="text-xl sm:text-2xl font-extrabold text-text-primary tracking-tight leading-none px-1">
                              {laneStates[selectedSlot].matchStatus.guardian && laneStates[selectedSlot].matchStatus.student ? "Authorized Entry" : "Verification Pending"}
                            </h3>
                            <p className="text-[10px] uppercase font-bold tracking-widest text-accent-emerald mt-2 opacity-80">
                              {laneStates[selectedSlot].matchStatus.guardian && !laneStates[selectedSlot].matchStatus.student && "Guardian Found. Please bring the student."}
                              {!laneStates[selectedSlot].matchStatus.guardian && laneStates[selectedSlot].matchStatus.student && "Student Found. Please bring a guardian."}
                              {laneStates[selectedSlot].matchStatus.guardian && laneStates[selectedSlot].matchStatus.student && "All Security checks passed."}
                            </p>
                          </div>
                        </div>

                        <div className="p-6 sm:p-8 space-y-7">
                          <div className="flex items-center justify-between">
                             <InfoTile label="Student Primary" value={laneStates[selectedSlot].matchedEntry.childName} />
                             <div className={cn("w-6 h-6 rounded-full flex items-center justify-center", laneStates[selectedSlot].matchStatus.student ? "bg-accent-emerald text-white" : "bg-background border border-surface-border text-text-secondary/20")}>
                               <CheckCircle2 className="w-4 h-4" />
                             </div>
                          </div>
                          <div className="grid grid-cols-2 gap-6">
                            <InfoTile label="Scholar ID" value={laneStates[selectedSlot].matchedEntry.scholarNo} mono />
                            <InfoTile label="Class/Section" value={laneStates[selectedSlot].matchedEntry.classSec} />
                          </div>
                          <div className="flex items-center justify-between">
                             <InfoTile 
                               label={laneStates[selectedSlot].matchStatus.guardianIndex !== undefined ? laneStates[selectedSlot].matchedEntry.guardians[laneStates[selectedSlot].matchStatus.guardianIndex].role : "Authorized Guardian"} 
                               value={laneStates[selectedSlot].matchStatus.guardianIndex !== undefined ? laneStates[selectedSlot].matchedEntry.guardians[laneStates[selectedSlot].matchStatus.guardianIndex].name : "Checking..."} 
                             />
                             <div className={cn("w-6 h-6 rounded-full flex items-center justify-center", laneStates[selectedSlot].matchStatus.guardian ? "bg-accent-emerald text-white" : "bg-background border border-surface-border text-text-secondary/20")}>
                               <CheckCircle2 className="w-4 h-4" />
                             </div>
                          </div>
                          
                          {laneStates[selectedSlot].matchStatus.guardian && laneStates[selectedSlot].matchStatus.student ? (
                            <button 
                              onClick={() => {
                                setLaneStates(prev => ({
                                  ...prev,
                                  [selectedSlot]: { matchedEntry: null, matchStatus: { guardian: false, student: false } }
                                }));
                              }}
                              className="w-full py-4 bg-accent-emerald text-white rounded-xl font-black text-xs tracking-[0.2em] uppercase hover:shadow-[0_0_20px_rgba(16,185,129,0.4)] transition-all cursor-pointer"
                            >
                              RELEASE STUDENT
                            </button>
                          ) : (laneStates[selectedSlot].matchStatus.guardian || laneStates[selectedSlot].matchStatus.student) ? (
                            <button 
                              onClick={() => {
                                setLaneStates(prev => ({
                                  ...prev,
                                  [selectedSlot]: { matchedEntry: null, matchStatus: { guardian: false, student: false } }
                                }));
                              }}
                              className="w-full py-4 bg-surface text-text-secondary rounded-xl font-black text-xs tracking-[0.2em] uppercase border border-surface-border cursor-pointer hover:bg-black/5 dark:hover:bg-white/5"
                            >
                              RESET LANE
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
            />
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

// --- Components ---

function NavBtn({ active, onClick, label, icon }: { active: boolean; onClick: () => void; label: string; icon: React.ReactNode }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "px-4 sm:px-6 py-2.5 rounded-xl transition-all duration-200 flex items-center space-x-2.5 group cursor-pointer",
        active 
          ? "bg-accent-emerald text-white shadow-sm shadow-accent-emerald/20" 
          : "text-text-secondary hover:text-text-primary hover:bg-black/5"
      )}
    >
      <span className={cn("transition-colors", active ? "text-white" : "text-text-secondary group-hover:text-accent-emerald")}>{icon}</span>
      <span className="hidden md:inline text-[11px] font-bold uppercase tracking-wider">{label}</span>
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
  cameraLabel = 'Scanner',
  deviceId
}: { 
  registry: RegistryEntry[]; 
  onMatch: (entry: RegistryEntry, type: 'guardian' | 'student', guardianIndex?: number) => void;
  onScanningStateChange: (state: boolean) => void;
  cameraLabel?: string;
  deviceId?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [detectionInfo, setDetectionInfo] = useState<{ label: string; confidence: number; isMatch: boolean; box: faceapi.Box }[]>([]);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const lastBeepTime = useRef<number>(0);

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
      if (person.studentFaceDescriptor?.length === 128) {
        studentDescriptors.push(new faceapi.LabeledFaceDescriptors(person.id, [new Float32Array(person.studentFaceDescriptor)]));
      }
      
      person.guardians?.forEach((guardian, idx) => {
        if (guardian.faceDescriptor?.length === 128) {
          guardianDescriptors.push(new faceapi.LabeledFaceDescriptors(`${person.id}_${idx}`, [new Float32Array(guardian.faceDescriptor)]));
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
        const staggerIndex = parseInt(cameraLabel.match(/\d+/)?.[0] || '0');
        await new Promise(r => setTimeout(r, staggerIndex * 600));
      }

      // Stop existing tracks if any
      streamRef.current?.getTracks().forEach(track => track.stop());

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

      const stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setIsCameraActive(true);
        onScanningStateChange(true);
      }
    } catch (err) {
      if (retryCount < 2) {
        console.warn(`Camera ${cameraLabel} failed, retrying... (${retryCount + 1})`);
        setTimeout(() => startCamera(retryCount + 1), 1000);
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Camera ${cameraLabel} access denied:`, msg);
      setErrorMsg(msg);
      setIsCameraActive(false);
    }
  };

  useEffect(() => {
    startCamera();
    return () => {
      streamRef.current?.getTracks().forEach(track => track.stop());
      onScanningStateChange(false);
      setIsCameraActive(false);
    };
  }, [deviceId]);

  useEffect(() => {
    let requestRef: number;
    let lastProcessed = 0;
    let isProcessingFrame = false;
    let lastMatchId = '';
    let lastMatchTime = 0;

    const runRecognition = async (time: number) => {
      // 1. Visibility & Processing Lock Check
      if (document.visibilityState !== 'visible' || isProcessingFrame) {
        requestRef = requestAnimationFrame(runRecognition);
        return;
      }

      // 2. Adaptive Throttling (Target ~10 FPS for detection)
      if (time - lastProcessed < 100) {
        requestRef = requestAnimationFrame(runRecognition);
        return;
      }

      if (!videoRef.current || !videoRef.current.videoWidth || registry.length === 0) {
        requestRef = requestAnimationFrame(runRecognition);
        return;
      }

      isProcessingFrame = true;
      lastProcessed = time;

      try {
        if (canvasRef.current) {
          const video = videoRef.current;
          if (canvasRef.current.width !== video.videoWidth || canvasRef.current.height !== video.videoHeight) {
            canvasRef.current.width = video.videoWidth;
            canvasRef.current.height = video.videoHeight;
          }
        }

        // 3. Higher Accuracy: scoreThreshold 0.6
        const detections = await faceapi.detectAllFaces(
          videoRef.current, 
          new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.6 })
        )
        .withFaceLandmarks()
        .withFaceDescriptors();

        const currentDetections: any[] = [];
        const { guardians: guardianMatcher, student: studentMatcher } = matchers.current;

        detections.forEach(detection => {
          let bestMatch: any = null;
          let matchType: 'student' | 'guardian' | null = null;
          let guardianIdx: number | undefined;

          if (studentMatcher) {
            const studentMatch = studentMatcher.findBestMatch(detection.descriptor);
            if (studentMatch.label !== 'unknown' && studentMatch.distance < 0.45) {
              bestMatch = studentMatch;
              matchType = 'student';
            }
          }

          if (!bestMatch && guardianMatcher) {
            const guardianMatch = guardianMatcher.findBestMatch(detection.descriptor);
            if (guardianMatch.label !== 'unknown' && guardianMatch.distance < 0.45) {
              bestMatch = guardianMatch;
              matchType = 'guardian';
              const [pid, gidx] = guardianMatch.label.split('_');
              guardianIdx = parseInt(gidx);
            }
          }

          const confidence = 1 - (bestMatch?.distance || detection.detection.score || 0.5);
          const normalizedConfidence = Math.min(Math.max((confidence - 0.2) * 1.5, 0), 0.99);

          const isUnknown = !bestMatch;
          if (isUnknown) {
            playWarningBeep();
          }

          currentDetections.push({
            label: bestMatch ? (matchType === 'student' ? 'Student' : 'Guardian') : 'Unknown',
            confidence: normalizedConfidence,
            isMatch: !!bestMatch,
            box: detection.detection.box
          });

          if (matchType) {
            const actualId = bestMatch.label.split('_')[0];
            const entry = registry.find(r => r.id === actualId);
            if (entry) {
              const matchKey = `${actualId}_${matchType}_${guardianIdx || 0}`;
              const now = Date.now();
              if (matchKey !== lastMatchId || now - lastMatchTime > 3000) {
                onMatch(entry, matchType, guardianIdx);
                lastMatchId = matchKey;
                lastMatchTime = now;
              }
            }
          }
        });

        setDetectionInfo(currentDetections);

        if (canvasRef.current) {
          const ctx = canvasRef.current.getContext('2d');
          if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }
      } catch (err) {
        console.warn("Recognition cycle error:", err);
      } finally {
        isProcessingFrame = false;
        requestRef = requestAnimationFrame(runRecognition);
      }
    };

    requestRef = requestAnimationFrame(runRecognition);
    return () => {
      cancelAnimationFrame(requestRef);
      isProcessingFrame = false;
    };
  }, [registry, onMatch]);

  return (
    <div className="w-full h-full relative bg-slate-900 group overflow-hidden">
      <video 
        ref={videoRef} 
        autoPlay 
        muted 
        playsInline 
        className="w-full h-full object-cover opacity-80 backdrop-grayscale transition-all group-hover:opacity-100 group-hover:backdrop-grayscale-0"
      />
      
      {/* Visual Canvas Overlay (Used for size) */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-cover pointer-events-none z-10 opacity-0" />
      
      <div className="absolute top-4 left-4 z-20 flex flex-col space-y-2">
        <div className="px-3 py-1 bg-white/90 backdrop-blur-md rounded-full border border-black/5 text-[9px] font-black tracking-widest text-slate-800 uppercase shadow-sm">
          {cameraLabel}
        </div>
        {!isCameraActive && (
          <div className="flex flex-col space-y-1">
            <div className="px-3 py-1 bg-red-500/90 backdrop-blur-md rounded-full text-[9px] font-black text-white uppercase tracking-wider">
              OFFLINE
            </div>
            {errorMsg && (
              <p className="text-[7px] text-red-200 font-mono bg-black/60 px-2 py-1 rounded-md leading-tight w-28 backdrop-blur-sm">
                {errorMsg}
              </p>
            )}
          </div>
        )}
      </div>

      <AnimatePresence>
        {detectionInfo.map((det, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="absolute border-2 pointer-events-none transition-all duration-150 ease-out"
            style={{
              left: `${(det.box.x / (videoRef.current?.videoWidth || 1)) * 100}%`,
              top: `${(det.box.y / (videoRef.current?.videoHeight || 1)) * 100}%`,
              width: `${(det.box.width / (videoRef.current?.videoWidth || 1)) * 100}%`,
              height: `${(det.box.height / (videoRef.current?.videoHeight || 1)) * 100}%`,
              borderColor: det.isMatch ? '#10b981' : (det.label === 'Unknown' ? '#ef4444' : 'rgba(255,255,255,0.4)'),
              borderStyle: 'solid',
              boxShadow: det.isMatch 
                ? '0 0 0 4px rgba(16,185,129,0.2)' 
                : (det.label === 'Unknown' ? '0 0 0 4px rgba(239,68,68,0.2)' : 'none'),
              borderRadius: '16px'
            }}
          >
            {det.isMatch ? (
              <motion.div 
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="absolute -top-10 left-0 bg-accent-emerald text-white text-[9px] font-extrabold uppercase px-3 py-1.5 rounded-full whitespace-nowrap shadow-lg flex items-center space-x-2"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{det.label} Verified</span>
              </motion.div>
            ) : (
               <div className={cn(
                 "absolute -top-8 left-0 text-white text-[8px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full backdrop-blur-md flex items-center space-x-2 transition-colors",
                 det.label === 'Unknown' ? "bg-red-500 shadow-lg text-white" : "bg-black/40 text-white/90"
               )}>
                 <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse", det.label === 'Unknown' ? "bg-white" : "bg-white/50")} />
                 <span>{det.label === 'Unknown' ? "Unknown" : "Scanning"}</span>
               </div>
            )}
            {det.isMatch && (
              <motion.div 
                animate={{ opacity: [0, 0.4, 0] }}
                transition={{ repeat: Infinity, duration: 1 }}
                className="absolute inset-0 bg-accent-emerald/20 rounded-[14px]"
              />
            )}
          </motion.div>
        ))}
      </AnimatePresence>

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
  return (
    <div className="space-y-2">
      <label className="info-label px-1">{label}</label>
      <input 
        type="text" 
        value={value}
        onChange={e => onChange(e.target.value)}
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
  onSetBackupInterval,
  systemSettings,
  onUpdateSettings
}: { 
  registry: RegistryEntry[]; 
  isAuthenticated: boolean; 
  onLogin: (pass: string) => void;
  isLoginError: boolean;
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
}) {
  const [pass, setPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [view, setView] = useState<'registry' | 'settings'>('registry');
  const [newPassword, setNewPassword] = useState(systemSettings.systemPassword || '');
  const [showNewPass, setShowNewPass] = useState(false);
  const [saveStatus, setSaveStatus] = useState(false);

  const filteredRegistry = registry.filter(person => {
    const searchLower = searchTerm.toLowerCase();
    const studentMatch = person.childName.toLowerCase().includes(searchLower);
    const scholarMatch = person.scholarNo.toLowerCase().includes(searchLower);
    const guardianMatch = person.guardians?.some(g => g.name.toLowerCase().includes(searchLower));
    return studentMatch || scholarMatch || guardianMatch;
  });

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

           <div className="hidden sm:flex bg-surface p-1 rounded-xl border border-surface-border mr-2 items-center space-x-2 px-3 self-stretch">
              <Database className="w-4 h-4 text-accent-emerald opacity-50" />
              <div className="flex flex-col">
                <span className="text-[10px] font-black text-text-primary uppercase italic leading-tight">Master Database</span>
                <span className="text-[8px] font-bold text-text-secondary uppercase tracking-widest leading-tight">Persistence Tier A</span>
              </div>
           </div>
           
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
                        {confirmDeleteId === person.id ? (
                          <div className="flex items-center justify-end space-x-2">
                             <button 
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-3 py-1.5 text-[8px] font-black uppercase text-text-secondary hover:text-white transition-all cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button 
                              onClick={() => {
                                onDelete(person.id);
                                setConfirmDeleteId(null);
                              }}
                              className="px-3 py-1.5 bg-red-500 text-white text-[8px] font-black uppercase rounded-lg shadow-lg shadow-red-500/20 transition-all cursor-pointer"
                            >
                              Confirm
                            </button>
                          </div>
                        ) : (
                          <button 
                            type="button"
                            onClick={() => setConfirmDeleteId(person.id)}
                            className="p-2 text-red-500/40 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
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
                    {confirmDeleteId === person.id ? (
                       <div className="flex items-center space-x-2">
                          <button 
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-4 py-2 text-[10px] font-black uppercase text-text-secondary hover:text-white transition-all cursor-pointer bg-white/5 rounded-xl"
                          >
                            Cancel
                          </button>
                          <button 
                            onClick={() => {
                              onDelete(person.id);
                              setConfirmDeleteId(null);
                            }}
                            className="px-4 py-2 bg-red-500 text-white text-[10px] font-black uppercase rounded-xl shadow-lg shadow-red-500/20 cursor-pointer"
                          >
                            Confirm Delete
                          </button>
                       </div>
                    ) : (
                      <button 
                        type="button"
                        onClick={() => setConfirmDeleteId(person.id)}
                        className="p-2.5 text-red-500 bg-red-500/10 rounded-xl cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
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
    </motion.div>
  );
}
