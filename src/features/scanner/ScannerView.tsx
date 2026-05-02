import React, { useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldCheck, Search, CheckCircle2, Camera, Play, Square, XCircle, RotateCcw } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useScannerStore } from '../../store/scannerStore';
import { useHistoryStore } from '../../store/historyStore';
import { ScanLane } from './ScanLane';

function InfoTile({ label, value, mono }: Readonly<{ label: string; value: string; mono?: boolean }>) {
  return (
    <div className="space-y-1.5 p-4 rounded-xl bg-background border border-surface-border shadow-sm">
      <p className="info-label opacity-60">{label}</p>
      <p className={cn('info-value', mono && 'font-mono text-sm tracking-tight')}>{value}</p>
    </div>
  );
}

export default function ScannerView() {
  const laneStates = useScannerStore((s) => s.laneStates);
  const selectedSlot = useScannerStore((s) => s.selectedSlot);
  const availableDevices = useScannerStore((s) => s.availableDevices);
  const assignedDevices = useScannerStore((s) => s.assignedDevices);
  const setSelectedSlot = useScannerStore((s) => s.setSelectedSlot);
  const resetLane = useScannerStore((s) => s.resetLane);
  const startScanLane = useScannerStore((s) => s.startScanLane);
  const stopScanLane = useScannerStore((s) => s.stopScanLane);
  const setAssignedDevice = useScannerStore((s) => s.setAssignedDevice);
  const allLogs = useHistoryStore((s) => s.logs);

  const handleReset = useCallback((slot: number) => resetLane(slot), [resetLane]);
  const handleStart = useCallback((slot: number) => startScanLane(slot), [startScanLane]);
  const handleStop = useCallback((slot: number) => stopScanLane(slot, 'incomplete'), [stopScanLane]);

  const selected = laneStates[selectedSlot];
  const isScanning = selected?.isScanning ?? false;
  const scanResult = selected?.scanResult ?? null;

  return (
    <motion.div
      key="scan"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10"
    >
      {/* Left: Camera Grid */}
      <div className="lg:col-span-8 flex flex-col space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1">
          {([1, 2, 3] as const).map((slot) => {
            const activeDevice = availableDevices.find((d) => d.deviceId === assignedDevices[slot]);
            const activeLabel = activeDevice?.label || (assignedDevices[slot] ? 'Camera Active' : 'No Source');
            const lane = laneStates[slot];
            const laneScanning = lane?.isScanning ?? false;
            const laneResult = lane?.scanResult ?? null;

            let scanBtn: React.ReactNode;
            if (laneResult) {
              scanBtn = (
                <button onClick={() => handleReset(slot)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface border border-surface-border text-[9px] font-black uppercase tracking-widest text-text-secondary hover:bg-black/5 dark:hover:bg-white/5 transition-all shrink-0">
                  <RotateCcw className="w-3 h-3" /> Reset
                </button>
              );
            } else if (laneScanning) {
              scanBtn = (
                <button onClick={() => handleStop(slot)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-[9px] font-black uppercase tracking-widest text-red-500 hover:bg-red-500/20 transition-all shrink-0">
                  <Square className="w-3 h-3 fill-current" /> Stop
                </button>
              );
            } else {
              scanBtn = (
                <button onClick={() => handleStart(slot)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-emerald text-white text-[9px] font-black uppercase tracking-widest hover:opacity-90 transition-all shrink-0 shadow-sm">
                  <Play className="w-3 h-3 fill-current" /> Scan
                </button>
              );
            }

            return (
              <div
                key={slot}
                className={cn(
                  'glass-card overflow-hidden bg-slate-100 relative flex flex-col min-h-[320px] shadow-sm ring-1 ring-black/5',
                  slot === 1 && 'md:col-span-2'
                )}
              >
                <div className="flex-1 relative min-h-0">
                  <ScanLane
                    slot={slot}
                    deviceId={assignedDevices[slot]}
                    cameraLabel={`Camera Node 0${slot}`}
                  />
                </div>

                {/* Lane footer: scan button + camera selector */}
                <div className="flex items-center gap-2 px-3 py-2 bg-surface border-t border-surface-border shrink-0">
                  {scanBtn}

                  {/* Camera name */}
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <Camera className="w-3 h-3 shrink-0 text-accent-emerald" />
                    <span className="text-[9px] font-bold uppercase tracking-widest truncate text-text-secondary/70">
                      {activeLabel}
                    </span>
                  </div>

                  {/* Camera dropdown */}
                  <select
                    value={assignedDevices[slot] ?? ''}
                    onChange={(e) => setAssignedDevice(slot, e.target.value)}
                    className="bg-background border border-surface-border rounded-lg px-2 py-1 text-[9px] font-bold uppercase text-text-primary outline-none cursor-pointer hover:bg-surface transition-all shadow-sm shrink-0 max-w-[130px]"
                  >
                    <option value="">No Source</option>
                    {availableDevices.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `Camera ${d.deviceId.slice(0, 6)}`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between p-5 glass-card">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-accent-emerald/10 rounded-2xl flex items-center justify-center text-accent-emerald">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-accent-emerald">
                Security active
              </p>
              <p className="text-sm text-text-primary font-bold">Biometric verification system ready</p>
            </div>
          </div>
        </div>
      </div>

      {/* Right: Result Panel */}
      <div className="lg:col-span-4">
        <div className="sticky top-28 space-y-6">
          {/* Lane selector tabs */}
          <div className="flex bg-background border border-surface-border p-1 rounded-2xl shadow-sm">
            {([1, 2, 3] as const).map((slot) => (
              <button
                key={slot}
                onClick={() => setSelectedSlot(slot)}
                className={cn(
                  'flex-1 py-2 px-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all',
                  selectedSlot === slot
                    ? 'bg-surface text-text-primary shadow-sm'
                    : 'text-text-secondary hover:text-text-primary'
                )}
              >
                Lane {slot}
                {laneStates[slot].isScanning && (
                  <span className="ml-2 w-1.5 h-1.5 bg-accent-emerald rounded-full inline-block animate-pulse" />
                )}
                {laneStates[slot].scanResult === 'verified' && (
                  <span className="ml-2 w-1.5 h-1.5 bg-accent-emerald rounded-full inline-block" />
                )}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {/* Scan completed — VERIFIED */}
            {scanResult === 'verified' && selected.matchedEntry && (
              <motion.div
                key={`verified-${selectedSlot}`}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="glass-card ring-2 ring-accent-emerald/40 overflow-hidden"
              >
                <div className="p-6 border-b border-surface-border bg-emerald-500/5 flex flex-col items-center text-center">
                  <CheckCircle2 className="w-12 h-12 text-accent-emerald mb-3" />
                  <div className="status-badge text-accent-emerald bg-accent-emerald-alpha border-accent-emerald/20 mb-2 text-[10px]">
                    Scan Complete
                  </div>
                  <h3 className="text-xl font-extrabold text-text-primary">Verified</h3>
                  <p className="text-[10px] text-accent-emerald font-bold uppercase tracking-widest mt-1 opacity-80">
                    Student & Guardian Cleared
                  </p>
                </div>
                <div className="p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <InfoTile label="Student" value={selected.matchedEntry.childName} />
                    <CheckCircle2 className="w-5 h-5 text-accent-emerald ml-3 shrink-0" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <InfoTile label="Scholar ID" value={selected.matchedEntry.scholarNo} mono />
                    <InfoTile label="Class" value={selected.matchedEntry.classSec} />
                  </div>
                  <InfoTile
                    label={selected.matchedEntry.guardians[selected.matchStatus.guardianIndex ?? 0]?.role ?? 'Guardian'}
                    value={selected.matchedEntry.guardians[selected.matchStatus.guardianIndex ?? 0]?.name ?? '—'}
                  />
                  <button
                    onClick={() => handleReset(selectedSlot)}
                    className="w-full py-4 bg-accent-emerald text-white rounded-xl font-black text-xs tracking-[0.2em] uppercase hover:shadow-[0_0_20px_rgba(16,185,129,0.4)] transition-all cursor-pointer"
                  >
                    RELEASE STUDENT
                  </button>
                </div>
              </motion.div>
            )}

            {/* Scan completed — INCOMPLETE */}
            {scanResult === 'incomplete' && (
              <motion.div
                key={`incomplete-${selectedSlot}`}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="glass-card ring-1 ring-red-500/30 overflow-hidden"
              >
                <div className="p-8 flex flex-col items-center text-center">
                  <XCircle className="w-12 h-12 text-red-400 mb-3" />
                  <div className="status-badge text-red-400 bg-red-500/10 border-red-500/20 mb-2 text-[10px]">
                    Scan Stopped
                  </div>
                  <h3 className="text-xl font-extrabold text-text-primary">Incomplete</h3>
                  <p className="text-[10px] text-text-secondary font-bold uppercase tracking-widest mt-2 opacity-70">
                    Verification was not completed
                  </p>
                  <button
                    onClick={() => handleReset(selectedSlot)}
                    className="mt-6 w-full py-3 bg-surface border border-surface-border text-text-secondary rounded-xl font-black text-xs tracking-[0.2em] uppercase cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-all"
                  >
                    RESET &amp; TRY AGAIN
                  </button>
                </div>
              </motion.div>
            )}

            {/* Scanning in progress — show live match details */}
            {isScanning && !scanResult && selected.matchedEntry && (
              <motion.div
                key={`scanning-${selectedSlot}-${selected.matchedEntry.id}`}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="glass-card ring-1 ring-amber-500/30 overflow-hidden"
              >
                <div className="p-6 border-b border-surface-border bg-amber-500/5 relative overflow-hidden">
                  <div className="relative">
                    <div className="status-badge text-amber-500 bg-amber-500/10 border-amber-500/20 mb-4 text-[10px]">
                      Awaiting Pairing
                    </div>
                    <h3 className="text-xl font-extrabold text-text-primary">Verification Pending</h3>
                    <p className="text-[10px] uppercase font-bold tracking-widest text-amber-500 mt-2 opacity-80">
                      {selected.matchStatus.guardian && !selected.matchStatus.student && 'Guardian found — bring the student'}
                      {!selected.matchStatus.guardian && selected.matchStatus.student && 'Student found — bring a guardian'}
                    </p>
                  </div>
                </div>
                <div className="p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <InfoTile label="Student" value={selected.matchedEntry.childName} />
                    <div className={cn('w-6 h-6 rounded-full flex items-center justify-center shrink-0 ml-3', selected.matchStatus.student ? 'bg-accent-emerald text-white' : 'bg-background border border-surface-border text-text-secondary/20')}>
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <InfoTile label="Scholar ID" value={selected.matchedEntry.scholarNo} mono />
                    <InfoTile label="Class" value={selected.matchedEntry.classSec} />
                  </div>
                  <div className="flex items-center justify-between">
                    <InfoTile
                      label={selected.matchedEntry.guardians[selected.matchStatus.guardianIndex ?? 0]?.role ?? 'Guardian'}
                      value={selected.matchedEntry.guardians[selected.matchStatus.guardianIndex ?? 0]?.name ?? 'Checking...'}
                    />
                    <div className={cn('w-6 h-6 rounded-full flex items-center justify-center shrink-0 ml-3', selected.matchStatus.guardian ? 'bg-accent-emerald text-white' : 'bg-background border border-surface-border text-text-secondary/20')}>
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                  </div>
                  <button
                    onClick={() => handleStop(selectedSlot)}
                    className="w-full py-3 bg-red-500/10 border border-red-500/30 text-red-500 rounded-xl font-black text-xs tracking-[0.2em] uppercase cursor-pointer hover:bg-red-500/20 transition-all"
                  >
                    STOP SCAN
                  </button>
                </div>
              </motion.div>
            )}

            {/* Idle — not scanning, no result, no match yet */}
            {!isScanning && !scanResult && (
              <motion.div
                key="idle"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="glass-card border-none p-10 text-center flex flex-col items-center justify-center"
              >
                <div className="w-20 h-20 bg-surface rounded-full flex items-center justify-center mx-auto mb-6 border border-surface-border relative shadow-sm">
                  <div className="absolute inset-0 bg-accent-emerald/5 rounded-full animate-ping" />
                  <Search className="w-8 h-8 text-text-secondary relative" />
                </div>
                <h3 className="text-sm font-bold text-text-primary uppercase tracking-widest">Lane {selectedSlot}</h3>
                <p className="text-[10px] text-text-secondary font-medium mt-2 max-w-[200px] mx-auto uppercase leading-relaxed opacity-60">
                  Press Start Scan to begin biometric verification
                </p>
                <button
                  onClick={() => handleStart(selectedSlot)}
                  className="mt-6 flex items-center gap-2 px-6 py-3 bg-accent-emerald text-white rounded-xl font-black text-xs tracking-[0.2em] uppercase hover:opacity-90 transition-all shadow-sm cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-current" />
                  START SCAN
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Mini logs */}
          <div className="glass-card p-6">
            <h4 className="info-label mb-4 opacity-50">Recent History</h4>
            <div className="space-y-3">
              {allLogs.length > 0 ? allLogs.slice(0, 3).map((log) => (
                <div
                  key={log.id}
                  className="flex justify-between items-center bg-white/2 p-3 rounded-lg border border-white/5"
                >
                  <div className="flex flex-col">
                    <span className="text-[11px] font-bold text-text-primary uppercase truncate max-w-[120px]">
                      {log.studentName}
                    </span>
                    <span className="text-[9px] font-bold text-text-secondary uppercase">
                      ID: {log.scholarNo}
                    </span>
                  </div>
                  <span className="font-mono text-[10px] text-accent-emerald">
                    {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              )) : (
                <p className="text-[10px] text-text-secondary text-center py-4 uppercase font-medium">
                  No records found
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
