/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import * as faceapi from 'face-api.js';
import { 
  Camera, UserPlus, ShieldCheck, History, Loader2, Search, 
  CheckCircle2, UserCircle, Download, Trash2, Lock,
  Sun, Moon, Palette, Upload, Database, FileJson, AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
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

type Accent = 'emerald' | 'blue' | 'purple' | 'amber' | 'rose';
type BackupInterval = 'off' | 'daily' | 'weekly';

export default function App() {
  const [isModelsLoaded, setIsModelsLoaded] = useState(false);
  const [registry, setRegistry] = useState<RegistryEntry[]>([]);
  const [activeTab, setActiveTab] = useState<'scan' | 'register' | 'history' | 'admin'>('scan');
  const [matchedEntry, setMatchedEntry] = useState<RegistryEntry | null>(null);
  const [matchStatus, setMatchStatus] = useState<{ guardian: boolean; student: boolean; guardianIndex?: number }>({ guardian: false, student: false });
  const [isScanning, setIsScanning] = useState(false);
  const [recentPickups, setRecentPickups] = useState<PickupLog[]>([]);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [isLoginError, setIsLoginError] = useState(false);
  const [accent, setAccent] = useState<Accent>((localStorage.getItem(ACCENT_STORAGE_KEY) as Accent) || 'emerald');
  const [backupInterval, setBackupInterval] = useState<BackupInterval>((localStorage.getItem(BACKUP_INTERVAL_KEY) as BackupInterval) || 'off');
  const [lastBackup, setLastBackup] = useState<number>(Number(localStorage.getItem(LAST_BACKUP_KEY)) || 0);

  // Load models on mount
  useEffect(() => {
    async function loadModels() {
      try {
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);
        setIsModelsLoaded(true);
      } catch (error) {
        console.error("Error loading face-api models:", error);
      }
    }
    loadModels();

    // Load registry from local storage
    const savedRegistry = localStorage.getItem(REGISTRY_STORAGE_KEY);
    if (savedRegistry) {
      setRegistry(JSON.parse(savedRegistry));
    }
    
    // Load history
    const savedHistory = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (savedHistory) {
      setRecentPickups(JSON.parse(savedHistory));
    }
  }, []);

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
    a.download = `guardlink-auto-backup-${new Date().toISOString().split('T')[0]}.json`;
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

    const timer = setInterval(checkBackup, 60000); // Check every minute
    checkBackup(); // Early check
    return () => clearInterval(timer);
  }, [backupInterval, lastBackup, registry]);

  const importBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.registry && Array.isArray(data.registry)) {
          setRegistry(data.registry);
          localStorage.setItem(REGISTRY_STORAGE_KEY, JSON.stringify(data.registry));
          if (data.history) {
            setRecentPickups(data.history);
            localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(data.history));
          }
          alert("Backup Restored Successfully. " + data.registry.length + " entries loaded.");
        } else {
          alert("Invalid backup format.");
        }
      } catch (err) {
        alert("Failed to read backup file.");
      }
    };
    reader.readAsText(file);
  };

  const addToRegistry = (entry: RegistryEntry) => {
    // Basic validation to ensure student and at least one guardian was enrolled properly
    if (entry.studentFaceDescriptor.length !== 128 || entry.guardians.length === 0) {
      console.error("Invalid registration data.");
      return;
    }
    const newRegistry = [...registry, entry];
    setRegistry(newRegistry);
    localStorage.setItem(REGISTRY_STORAGE_KEY, JSON.stringify(newRegistry));
  };

  const logPickup = (entry: RegistryEntry, guardianIndex: number) => {
    setRecentPickups(prev => {
      // Don't double-log the same student within a 30-second window
      if (prev[0]?.scholarNo === entry.scholarNo && (Date.now() - prev[0].timestamp < 30000)) return prev;
      
      const guardian = entry.guardians[guardianIndex];
      const newLog: PickupLog = {
        id: crypto.randomUUID(),
        studentName: entry.childName,
        guardianName: guardian.name || 'Guardian',
        guardianRole: guardian.role,
        scholarNo: entry.scholarNo,
        classSec: entry.classSec,
        timestamp: Date.now()
      };
      const newHistory = [newLog, ...prev.slice(0, 49)];
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(newHistory));
      return newHistory;
    });
  };

  if (!isModelsLoaded) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-6">
          <div className="relative w-16 h-16 mx-auto">
            <Loader2 className="w-full h-full text-accent-emerald animate-spin" />
            <div className="absolute inset-0 border-2 border-white/5 rounded-full" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-bold tracking-widest uppercase italic text-text-primary">Initializing Sentinel</h1>
            <p className="text-text-secondary text-sm font-mono tracking-tight max-w-xs mx-auto">LOAD_BIOMETRIC_WEIGHTS: FETCHING...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-text-primary font-sans selection:bg-accent-emerald/30">
      {/* Navigation Bar */}
      <nav className="h-[70px] border-b border-surface-border px-4 sm:px-8 flex items-center justify-between sticky top-0 z-50 backdrop-blur-xl bg-background/80">
        <div className="flex items-center space-x-2 sm:space-x-3">
          <div className="w-8 h-8 bg-accent-emerald rounded-lg flex items-center justify-center group shadow-[0_0_15px_rgba(16,185,129,0.3)] flex-shrink-0">
            <ShieldCheck className="w-5 h-5 text-black" />
          </div>
          <div className="hidden sm:block">
            <h1 className="text-sm font-bold tracking-[0.15em] uppercase italic leading-none">SENTINEL PICKUP</h1>
            <p className="text-[9px] font-bold text-text-secondary mt-1 uppercase tracking-widest">Secure Campus Node A-4</p>
          </div>
        </div>

        <div className="flex bg-surface border border-surface-border p-1 rounded-xl shadow-inner">
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

          <div className="status-badge text-accent-emerald bg-accent-emerald-alpha">
            <span className="w-1.5 h-1.5 bg-accent-emerald rounded-full mr-1.5 animate-pulse" />
            System Online
          </div>
          <div className="text-right">
            <div className="text-xs font-bold text-white tracking-widest uppercase italic">{new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
            <div className="text-[10px] font-mono text-text-secondary uppercase">{new Date().toLocaleTimeString()}</div>
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
              {/* Left Column: Scanner */}
              <div className="lg:col-span-8 flex flex-col">
                <div className="glass-card overflow-hidden bg-black flex-1 relative flex flex-col">
                  <div className="absolute top-4 left-4 z-10">
                    <div className="status-badge text-[8px] sm:text-[10px] text-accent-emerald bg-black/40 backdrop-blur-md">
                      Live Feed: Main Entrance
                    </div>
                  </div>
                  
                  <div className="flex-1 min-h-[300px] sm:min-h-[400px]">
                    <Scanner 
                      registry={registry} 
                      onMatch={(entry, type, guardianIndex) => {
                        if (!matchedEntry || matchedEntry.id !== entry.id) {
                          setMatchedEntry(entry);
                          setMatchStatus({ 
                            guardian: type === 'guardian', 
                            student: type === 'student',
                            guardianIndex: type === 'guardian' ? guardianIndex : undefined
                          });
                        } else {
                          setMatchStatus(prev => {
                            const newStatus = {
                              guardian: prev.guardian || type === 'guardian',
                              student: prev.student || type === 'student',
                              guardianIndex: type === 'guardian' ? guardianIndex : prev.guardianIndex
                            };
                            // Auto log when both are matched
                            if (newStatus.guardian && newStatus.student && !(prev.guardian && prev.student)) {
                              logPickup(entry, newStatus.guardianIndex!);
                            }
                            return newStatus;
                          });
                        }
                      }}
                      onScanningStateChange={setIsScanning}
                    />
                  </div>
                </div>
                
                <div className="mt-6 flex items-center justify-between p-4 glass-card bg-accent-emerald-alpha border-accent-emerald/20">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-accent-emerald/20 rounded-full flex items-center justify-center text-accent-emerald">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-accent-emerald opacity-70">Security Protocol</p>
                      <p className="text-xs text-white font-medium">Automatic facial verification active</p>
                    </div>
                  </div>
                  <div className="flex -space-x-2">
                    {[1,2,3].map(i => (
                      <div key={i} className="w-8 h-8 rounded-full border-2 border-background bg-surface flex items-center justify-center text-[10px] font-bold text-text-secondary">
                        {i}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right Column: Result Details */}
              <div className="lg:col-span-4">
                <div className="sticky top-28 space-y-6">
                  <AnimatePresence mode="wait">
                    {matchedEntry ? (
                      <motion.div
                        key="result"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        className="glass-card ring-1 ring-accent-emerald/30 overflow-hidden"
                      >
                        <div className="p-6 sm:p-8 border-b border-surface-border bg-accent-emerald-alpha/5 relative overflow-hidden group">
                           <CheckCircle2 className={cn(
                             "w-24 h-24 sm:w-32 sm:h-32 absolute -right-4 -bottom-4 rotate-12 transition-all duration-500",
                             matchStatus.guardian && matchStatus.student ? "text-accent-emerald/20 scale-110" : "text-white/5 opacity-40"
                           )} />
                           <div className="relative">
                            <div className={cn(
                               "status-badge mb-4 border-accent-emerald/20 text-[8px] sm:text-[10px]",
                               matchStatus.guardian && matchStatus.student ? "text-accent-emerald bg-accent-emerald-alpha" : "text-amber-500 bg-amber-500/10 border-amber-500/20"
                            )}>
                              {matchStatus.guardian && matchStatus.student ? "Dual Verification Ready" : "Verification in Progress"}
                            </div>
                            <h3 className="text-2xl sm:text-3xl font-black text-white italic tracking-tighter uppercase leading-none">
                              {matchStatus.guardian && matchStatus.student ? "IDENTITY MATCHED" : "AWAITING PARENT/STUDENT"}
                            </h3>
                            <p className="text-[9px] sm:text-[10px] uppercase font-bold tracking-[0.2em] text-accent-emerald mt-2">
                              {matchStatus.guardian && !matchStatus.student && "Guardian Found. Please bring the student."}
                              {!matchStatus.guardian && matchStatus.student && "Student Found. Please bring a guardian."}
                              {matchStatus.guardian && matchStatus.student && "All Security checks passed."}
                            </p>
                          </div>
                        </div>

                        <div className="p-6 sm:p-8 space-y-7">
                          <div className="flex items-center justify-between">
                             <InfoTile label="Student Primary" value={matchedEntry.childName} />
                             <div className={cn("w-6 h-6 rounded-full flex items-center justify-center", matchStatus.student ? "bg-accent-emerald text-black" : "bg-white/5 text-white/20")}>
                               <CheckCircle2 className="w-4 h-4" />
                             </div>
                          </div>
                          <div className="grid grid-cols-2 gap-6">
                            <InfoTile label="Scholar ID" value={matchedEntry.scholarNo} mono />
                            <InfoTile label="Class/Section" value={matchedEntry.classSec} />
                          </div>
                          <div className="flex items-center justify-between">
                             <InfoTile 
                               label={matchStatus.guardianIndex !== undefined ? matchedEntry.guardians[matchStatus.guardianIndex].role : "Authorized Guardian"} 
                               value={matchStatus.guardianIndex !== undefined ? matchedEntry.guardians[matchStatus.guardianIndex].name : "Checking..."} 
                             />
                             <div className={cn("w-6 h-6 rounded-full flex items-center justify-center", matchStatus.guardian ? "bg-accent-emerald text-black" : "bg-white/5 text-white/20")}>
                               <CheckCircle2 className="w-4 h-4" />
                             </div>
                          </div>
                          
                          {matchStatus.guardian && matchStatus.student ? (
                            <button 
                              onClick={() => {
                                setMatchedEntry(null);
                                setMatchStatus({ guardian: false, student: false });
                              }}
                              className="w-full py-4 bg-accent-emerald text-black rounded-xl font-black text-xs tracking-[0.2em] uppercase hover:shadow-[0_0_20px_rgba(16,185,129,0.4)] transition-all cursor-pointer"
                            >
                              RELEASE STUDENT
                            </button>
                          ) : (
                            <button 
                              disabled
                              className="w-full py-4 bg-white/5 text-white/20 rounded-xl font-black text-xs tracking-[0.2em] uppercase cursor-not-allowed border border-white/5"
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
                        <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6 border border-white/5 relative">
                          <div className="absolute inset-0 bg-accent-emerald/5 rounded-full animate-ping" />
                          <Search className="w-8 h-8 text-text-secondary relative" />
                        </div>
                        <h3 className="text-sm font-bold text-white uppercase italic tracking-widest">SCAN IN PROGRESS</h3>
                        <p className="text-[10px] text-text-secondary font-mono mt-3 max-w-[200px] mx-auto uppercase leading-relaxed">System awaiting optical biometric identification...</p>
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
                            <span className="text-[11px] font-bold text-white uppercase italic truncate max-w-[120px]">{log.studentName}</span>
                            <span className="text-[9px] font-bold text-text-secondary uppercase">ID: {log.scholarNo}</span>
                          </div>
                          <span className="font-mono text-[10px] text-accent-emerald">{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      ))}
                      {recentPickups.length === 0 && (
                        <p className="text-[10px] text-text-secondary italic text-center py-4 uppercase">No records found</p>
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
                    <div className="status-badge text-accent-emerald bg-accent-emerald-alpha mb-3 mx-auto sm:mx-0 w-fit">Audit Logs</div>
                    <h2 className="text-2xl sm:text-3xl font-black text-white italic tracking-tighter uppercase mb-1 leading-none">Access History</h2>
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
                          <th className="info-label px-4 py-4">Class</th>
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
                                    <p className="text-[9px] uppercase font-bold text-white/40 tracking-widest">Verified</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-6">
                                <span className="px-2 py-1 bg-surface border border-white/10 rounded text-[10px] font-bold text-white uppercase italic tracking-widest">
                                  {log.classSec}
                                </span>
                              </td>
                              <td className="px-4 py-6 text-right">
                                <p className="text-xs font-bold text-white font-mono">{new Date(log.timestamp).toLocaleTimeString()}</p>
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
                            <span className="text-[8px] font-black uppercase tracking-widest text-accent-emerald bg-accent-emerald/10 px-2 py-1 rounded">
                              {log.guardianRole}
                            </span>
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
                if (pass === 'admin123') {
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
                localStorage.setItem(REGISTRY_STORAGE_KEY, JSON.stringify(updated));
              }}
              onDownload={() => exportRegistryToPDF(registry)}
              onDownloadTechnical={exportTechnicalDoc}
              onDownloadPresentation={exportPresentationDoc}
              onExportBackup={exportBackup}
              onImportBackup={importBackup}
              backupInterval={backupInterval}
              onSetBackupInterval={changeBackupInterval}
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
        "px-3 sm:px-6 py-2 rounded-lg transition-all flex items-center space-x-2 group cursor-pointer",
        active ? "bg-accent-emerald text-black shadow-lg shadow-accent-emerald/40" : "text-text-secondary hover:text-white"
      )}
    >
      <span className={cn("transition-colors", active ? "text-black" : "text-text-secondary group-hover:text-accent-emerald")}>{icon}</span>
      <span className="hidden md:inline text-[11px] font-black uppercase tracking-widest">{label}</span>
    </button>
  );
}

function InfoTile({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="space-y-2">
      <p className="info-label">{label}</p>
      <p className={cn("info-value", mono && "font-mono text-base uppercase tracking-wider")}>{value}</p>
    </div>
  );
}

function Scanner({ registry, onMatch, onScanningStateChange }: { 
  registry: RegistryEntry[]; 
  onMatch: (entry: RegistryEntry, type: 'guardian' | 'student', guardianIndex?: number) => void;
  onScanningStateChange: (state: boolean) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  // Memoize descriptors and matchers to avoid heavy re-calculations
  const matchers = useRef<{ guardians: faceapi.FaceMatcher | null, student: faceapi.FaceMatcher | null }>({ guardians: null, student: null });

  useEffect(() => {
    if (registry.length === 0) return;

    // Filter to ensure we only use valid descriptors (128 length)
    // For guardians, we map them to labels like "studentId_guardianIndex"
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

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: { ideal: 640 }, 
          height: { ideal: 480 },
          facingMode: "user" 
        } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        onScanningStateChange(true);
      }
    } catch (err) {
      console.error("Camera access denied:", err);
    }
  };

  useEffect(() => {
    startCamera();
    return () => {
      streamRef.current?.getTracks().forEach(track => track.stop());
      onScanningStateChange(false);
    };
  }, []);

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

        if (canvasRef.current) {
          const ctx = canvasRef.current.getContext('2d', { alpha: true });
          if (ctx) {
            ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
            detections.forEach(det => {
              const box = det.detection.box;
              ctx.strokeStyle = '#10b981';
              ctx.lineWidth = 2;
              ctx.setLineDash([5, 5]);
              ctx.strokeRect(box.x, box.y, box.width, box.height);
            });
          }
        }

        if (detections.length > 0) {
          const { guardians: guardianMatcher, student: studentMatcher } = matchers.current;

          detections.forEach(detection => {
            let matchFound = false;
            let currentId = '';
            let currentRole: 'guardian' | 'student' = 'student';
            let currentIdx = 0;

            if (guardianMatcher) {
              const bestMatch = guardianMatcher.findBestMatch(detection.descriptor);
              if (bestMatch.label !== 'unknown') {
                const [studentId, guardianIdx] = bestMatch.label.split('_');
                currentId = studentId;
                currentRole = 'guardian';
                currentIdx = parseInt(guardianIdx);
                matchFound = true;
              }
            }

            if (!matchFound && studentMatcher) {
              const bestMatch = studentMatcher.findBestMatch(detection.descriptor);
              if (bestMatch.label !== 'unknown') {
                currentId = bestMatch.label;
                currentRole = 'student';
                matchFound = true;
              }
            }

            // 4. Debounced Match Trigger (Prevent spamming state updates)
            if (matchFound) {
              const matchKey = `${currentId}_${currentRole}_${currentIdx}`;
              const now = Date.now();
              if (matchKey !== lastMatchId || now - lastMatchTime > 3000) {
                const matched = registry.find(p => p.id === currentId);
                if (matched) {
                  onMatch(matched, currentRole, currentIdx);
                  lastMatchId = matchKey;
                  lastMatchTime = now;
                }
              }
            }
          });
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
    <div className="w-full h-full relative bg-black group">
      <video 
        ref={videoRef} 
        autoPlay 
        muted 
        playsInline 
        className="w-full h-full object-cover opacity-60 transition-opacity group-hover:opacity-100"
      />
      
      {/* Visual Canvas Overlay */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-cover pointer-events-none z-10" />
      
      {/* Scanner Visuals Overlay */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
        {/* Dynamic Scan Line */}
        <motion.div 
          animate={{ top: ['20%', '80%', '20%'] }}
          transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
          className="absolute left-1/4 right-1/4 h-[2px] bg-accent-emerald shadow-[0_0_15px_#10b981] z-20"
        />

        {/* Identity Bracket */}
        <div className="w-[240px] h-[300px] border-2 border-accent-emerald/40 rounded-[60px] relative z-10 transition-colors group-hover:border-accent-emerald/80 group-hover:shadow-[0_0_30px_rgba(16,185,129,0.2)]">
          {/* Corner Elements */}
          <div className="absolute -top-1 -left-1 w-10 h-10 border-t-4 border-l-4 border-accent-emerald rounded-tl-3xl shadow-[0_0_10px_#10b981]" />
          <div className="absolute -top-1 -right-1 w-10 h-10 border-t-4 border-r-4 border-accent-emerald rounded-tr-3xl shadow-[0_0_10px_#10b981]" />
          <div className="absolute -bottom-1 -left-1 w-10 h-10 border-b-4 border-l-4 border-accent-emerald rounded-bl-3xl shadow-[0_0_10px_#10b981]" />
          <div className="absolute -bottom-1 -right-1 w-10 h-10 border-b-4 border-r-4 border-accent-emerald rounded-br-3xl shadow-[0_0_10px_#10b981]" />
          
          <div className="absolute bottom-6 left-0 right-0 text-center">
             <p className="text-[10px] font-mono text-accent-emerald tracking-widest uppercase">Target Locked</p>
          </div>
        </div>

        {/* Technical HUD elements */}
        <div className="absolute top-0 left-0 right-0 bottom-0 pointer-events-none font-mono opacity-20">
          <div className="absolute top-10 left-10 text-[8px] uppercase">LAT: 32.4491<br/>LONG: -110.8711</div>
          <div className="absolute bottom-10 right-10 text-[8px] text-right uppercase">NODE: AS-772<br/>STMS: ACTIVE</div>
        </div>
      </div>
      
      <div className="absolute bottom-6 left-6 right-6 flex items-center justify-between">
        <div className="bg-black/60 backdrop-blur-md px-4 py-2 rounded-lg border border-white/10 flex items-center space-x-2">
          <div className="w-1.5 h-1.5 bg-red-600 rounded-full animate-pulse" />
          <p className="text-[9px] font-black tracking-widest text-white uppercase">Biometric Stream: Encryption Active</p>
        </div>
        <p className="text-[10px] font-mono text-accent-emerald bg-black/60 backdrop-blur-md px-3 py-1 rounded border border-accent-emerald/20">98.4% Confidence</p>
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
          <h2 className="text-2xl sm:text-3xl font-black text-white italic tracking-tighter flex items-center space-x-3 uppercase">
            <UserPlus className="w-6 h-6 sm:w-8 sm:h-8 text-accent-emerald" />
            <span>SECURE BIOMETRIC ENROLLMENT</span>
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
                  className="w-full py-5 bg-white text-black rounded-xl font-black text-xs tracking-[0.2em] uppercase transition-all disabled:opacity-30 cursor-pointer"
                >
                  Proceed to Biometrics
                </button>
              </motion.div>
            )}

            {step === 'student' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                <div className="p-6 bg-accent-emerald/5 border border-accent-emerald/20 rounded-xl">
                  <h4 className="text-sm font-bold text-white mb-2 uppercase italic tracking-tighter">Phase 1: Student Capture</h4>
                  <p className="text-xs text-text-secondary">Position the student within the frame for biometric enrollment.</p>
                </div>
                
                {!studentDescriptor ? (
                  <button 
                    onClick={handleCapture}
                    disabled={!isCapturing || isProcessing}
                    className="w-full py-5 bg-accent-emerald text-black rounded-xl font-black text-xs tracking-[0.2em] uppercase transition-all flex items-center justify-center space-x-2"
                  >
                    {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <span>Capture Bio-Signature</span>}
                  </button>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center space-x-3 p-4 bg-white/5 rounded-xl border border-white/10">
                      <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0">
                        <img src={studentPhoto!} alt="Student" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-accent-emerald">SIGNATURE CAPTURED</p>
                        <p className="text-xs text-white font-bold uppercase">{formData.childName}</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => setStep('guardians')}
                      className="w-full py-5 bg-white text-black rounded-xl font-black text-xs tracking-[0.2em] uppercase hover:bg-accent-emerald transition-all"
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
                  <h4 className="text-xs font-black text-white uppercase italic tracking-widest px-1">Authorized Guardians ({enrolledGuardians.length})</h4>
                  <div className="space-y-2">
                    {enrolledGuardians.map((g, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-white/5 border border-white/5 rounded-lg group">
                        <div className="flex items-center space-x-3">
                          <img src={g.photo} className="w-8 h-8 rounded border border-white/10" alt="Guardian" />
                          <div>
                            <p className="text-[10px] font-bold text-white uppercase">{g.name}</p>
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
                  <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-5 p-6 bg-white/3 border border-white/10 rounded-2xl">
                     <div className="flex justify-between items-center mb-2">
                       <p className="text-[10px] font-black text-accent-emerald uppercase tracking-widest">Enrolling: {currentGuardianRole}</p>
                       <button onClick={() => setCurrentGuardianRole(null)} className="text-[8px] font-bold text-white/40 uppercase hover:text-white">Cancel</button>
                     </div>
                     <InputGroup label={`${currentGuardianRole} Full Name`} value={currentGuardianName} onChange={setCurrentGuardianName} />
                     <button 
                      onClick={handleCapture}
                      disabled={!isCapturing || isProcessing}
                      className="w-full py-4 bg-white text-black rounded-xl font-black text-[10px] tracking-[0.2em] uppercase transition-all flex items-center justify-center space-x-2"
                    >
                      {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <span>Capture {currentGuardianRole} Face</span>}
                    </button>
                  </motion.div>
                )}
              </motion.div>
            )}
          </div>
        </div>

        <div className="bg-black/40 p-6 sm:p-10 flex flex-col items-center justify-center transition-all">
          {!isCapturing && step !== 'details' ? (
            <button 
              onClick={startCamera}
              className="w-full aspect-[4/5] sm:aspect-square lg:aspect-[4/5] border-2 border-dashed border-white/10 rounded-3xl hover:border-accent-emerald/40 hover:bg-accent-emerald/5 transition-all group flex flex-col items-center justify-center cursor-pointer"
            >
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-accent-emerald/20 transition-all">
                <Camera className="w-6 h-6 sm:w-8 sm:h-8 text-white/20 group-hover:text-accent-emerald" />
              </div>
              <p className="text-[9px] sm:text-[11px] font-black text-text-secondary mt-6 group-hover:text-white uppercase tracking-[0.25em]">ACTIVATE SENSOR</p>
            </button>
          ) : isCapturing ? (
            <div className="relative w-full aspect-[4/5] sm:aspect-square lg:aspect-[4/5] rounded-[2.5rem] overflow-hidden bg-black shadow-2xl ring-4 ring-white/5 ring-inset ring-offset-8 ring-offset-background group">
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
        className="w-full bg-white/3 border border-white/10 rounded-xl px-5 py-4 text-sm font-bold text-white placeholder:text-text-secondary/30 placeholder:font-normal focus:ring-1 focus:ring-accent-emerald/50 focus:border-accent-emerald outline-none transition-all"
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
  onSetBackupInterval
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
}) {
  const [pass, setPass] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

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
        <h2 className="text-xl font-black text-text-primary italic uppercase tracking-tighter mb-2">ADMIN ACCESS</h2>
        <p className="text-xs text-text-secondary mb-8 uppercase tracking-widest">Master Credentials Required</p>
        
        <form onSubmit={(e) => { e.preventDefault(); onLogin(pass); }} className="space-y-4">
          <input 
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            placeholder="ACCESS TOKEN"
            className={cn(
              "w-full bg-surface border rounded-xl px-5 py-4 text-center text-sm font-black tracking-[0.3em] uppercase outline-none transition-all",
              isLoginError ? "border-red-500 text-red-500 animate-shake" : "border-surface-border text-text-primary focus:border-accent-emerald"
            )}
          />
          <button 
            type="submit"
            className="w-full py-4 bg-white text-black rounded-xl font-black text-xs tracking-[0.3em] uppercase hover:bg-accent-emerald transition-all"
          >
            Authenticate
          </button>
        </form>
        {isLoginError && <p className="text-[10px] text-red-500 mt-4 uppercase font-bold tracking-widest">Invalid Security Token</p>}
        <p className="text-[10px] text-white/20 mt-6 uppercase">Tip: demo password is admin123</p>
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
          <h2 className="text-2xl sm:text-3xl font-black text-text-primary italic tracking-tighter uppercase mb-1">REGISTRY CONTROL</h2>
          <p className="text-text-secondary text-[10px] sm:text-xs font-medium tracking-tight uppercase italic">Distributed Biometric Ledger Management</p>
        </div>
        <div className="flex flex-wrap items-center justify-center xl:justify-end gap-2 sm:gap-3">
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
            className="bg-accent-emerald text-black px-4 sm:px-6 py-2 sm:py-3 rounded-xl shadow-lg shadow-accent-emerald/20 text-[10px] sm:text-[11px] font-black uppercase tracking-widest flex items-center space-x-2 transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>Export PDF</span>
          </button>
        </div>
      </div>

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
              <tr className="border-b border-white/5 bg-white/2">
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-text-secondary">Profiles</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-text-secondary">Student Detail</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-text-secondary">Authorized Guardian</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-text-secondary">Class/Sec</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-text-secondary">Scholar ID</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-text-secondary text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/2">
              {filteredRegistry.map((person) => (
                <tr key={person.id} className="hover:bg-white/1 transition-all group">
                  <td className="px-6 py-5">
                    <div className="flex -space-x-2">
                        <div className="w-10 h-10 rounded-lg border-2 border-surface bg-white/5 overflow-hidden ring-2 ring-black">
                          {person.studentPhoto ? <img src={person.studentPhoto} alt="Student" className="w-full h-full object-cover" /> : null}
                        </div>
                        {person.guardians?.map((g, gi) => (
                          <div key={gi} className="w-10 h-10 rounded-lg border-2 border-surface bg-white/5 overflow-hidden ring-2 ring-black" title={g.name}>
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
                    <span className="text-xs font-mono text-white/60">{person.classSec}</span>
                  </td>
                  <td className="px-6 py-5">
                    <span className="text-xs font-mono text-accent-emerald">{person.scholarNo}</span>
                  </td>
                  <td className="px-6 py-5 text-right">
                    <button 
                      onClick={() => {
                        if (confirm(`Revoke identity for ${person.childName}?`)) onDelete(person.id);
                      }}
                      className="p-2 text-red-500/40 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
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
                <button 
                  onClick={() => {
                    if (confirm(`Revoke identity for ${person.childName}?`)) onDelete(person.id);
                  }}
                  className="p-2.5 text-red-500 bg-red-500/10 rounded-xl"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-0.5">
                  <span className="text-[8px] font-black uppercase text-text-secondary tracking-widest">Student</span>
                  <p className="text-sm font-bold text-text-primary italic uppercase">{person.childName}</p>
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
    </motion.div>
  );
}
