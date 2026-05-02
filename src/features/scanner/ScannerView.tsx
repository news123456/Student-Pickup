import React, { useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldCheck, Search, CheckCircle2, Camera } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useScannerStore } from '../../store/scannerStore';
import { useHistoryStore } from '../../store/historyStore';
import { ScanLane } from './ScanLane';

function InfoTile({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
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
  const setAssignedDevice = useScannerStore((s) => s.setAssignedDevice);
  const allLogs = useHistoryStore((s) => s.logs);

  const handleReset = useCallback((slot: number) => resetLane(slot), [resetLane]);

  const selected = laneStates[selectedSlot];

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

                {/* Camera selector footer */}
                <div className="flex items-center gap-3 px-4 py-2.5 bg-surface border-t border-surface-border shrink-0">
                  <div className="flex items-center gap-2 text-text-secondary min-w-0 flex-1">
                    <Camera className="w-3.5 h-3.5 shrink-0 text-accent-emerald" />
                    <span className="text-[9px] font-bold uppercase tracking-widest truncate text-text-secondary/70">
                      {activeLabel}
                    </span>
                  </div>
                  <select
                    value={assignedDevices[slot] ?? ''}
                    onChange={(e) => setAssignedDevice(slot, e.target.value)}
                    className="bg-background border border-surface-border rounded-lg px-2.5 py-1 text-[9px] font-bold uppercase text-text-primary outline-none cursor-pointer hover:bg-surface transition-all shadow-sm shrink-0 max-w-[140px]"
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
              <p className="text-sm text-text-primary font-bold">Biometric verification in progress</p>
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
                {laneStates[slot].matchedEntry && (
                  <span className="ml-2 w-1.5 h-1.5 bg-accent-emerald rounded-full inline-block animate-pulse" />
                )}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {selected.matchedEntry ? (
              <motion.div
                key={`result-${selectedSlot}-${selected.matchedEntry.id}`}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="glass-card ring-1 ring-accent-emerald/30 overflow-hidden"
              >
                <div className="p-6 sm:p-8 border-b border-surface-border bg-accent-emerald-alpha/5 relative overflow-hidden">
                  <CheckCircle2
                    className={cn(
                      'w-24 h-24 sm:w-32 sm:h-32 absolute -right-4 -bottom-4 rotate-12 opacity-20 transition-all duration-500',
                      selected.matchStatus.guardian && selected.matchStatus.student
                        ? 'text-accent-emerald scale-110'
                        : 'text-text-secondary/40'
                    )}
                  />
                  <div className="relative">
                    <div
                      className={cn(
                        'status-badge mb-4 border-accent-emerald/20 text-[8px] sm:text-[10px]',
                        selected.matchStatus.guardian && selected.matchStatus.student
                          ? 'text-accent-emerald bg-accent-emerald-alpha'
                          : 'text-amber-500 bg-amber-500/10 border-amber-500/20'
                      )}
                    >
                      {selected.matchStatus.guardian && selected.matchStatus.student
                        ? 'Identification Verified'
                        : 'Awaiting Pairing'}
                    </div>
                    <h3 className="text-xl sm:text-2xl font-extrabold text-text-primary tracking-tight leading-none px-1">
                      {selected.matchStatus.guardian && selected.matchStatus.student
                        ? 'Authorized Entry'
                        : 'Verification Pending'}
                    </h3>
                    <p className="text-[10px] uppercase font-bold tracking-widest text-accent-emerald mt-2 opacity-80">
                      {selected.matchStatus.guardian && !selected.matchStatus.student &&
                        'Guardian Found. Please bring the student.'}
                      {!selected.matchStatus.guardian && selected.matchStatus.student &&
                        'Student Found. Please bring a guardian.'}
                      {selected.matchStatus.guardian && selected.matchStatus.student &&
                        'All Security checks passed.'}
                    </p>
                  </div>
                </div>

                <div className="p-6 sm:p-8 space-y-7">
                  <div className="flex items-center justify-between">
                    <InfoTile label="Student Primary" value={selected.matchedEntry.childName} />
                    <div
                      className={cn(
                        'w-6 h-6 rounded-full flex items-center justify-center',
                        selected.matchStatus.student
                          ? 'bg-accent-emerald text-white'
                          : 'bg-background border border-surface-border text-text-secondary/20'
                      )}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <InfoTile label="Scholar ID" value={selected.matchedEntry.scholarNo} mono />
                    <InfoTile label="Class/Section" value={selected.matchedEntry.classSec} />
                  </div>

                  <div className="flex items-center justify-between">
                    <InfoTile
                      label={
                        selected.matchStatus.guardianIndex !== undefined
                          ? selected.matchedEntry.guardians[selected.matchStatus.guardianIndex]?.role ?? 'Authorized Guardian'
                          : 'Authorized Guardian'
                      }
                      value={
                        selected.matchStatus.guardianIndex !== undefined
                          ? selected.matchedEntry.guardians[selected.matchStatus.guardianIndex]?.name ?? 'Checking...'
                          : 'Checking...'
                      }
                    />
                    <div
                      className={cn(
                        'w-6 h-6 rounded-full flex items-center justify-center',
                        selected.matchStatus.guardian
                          ? 'bg-accent-emerald text-white'
                          : 'bg-background border border-surface-border text-text-secondary/20'
                      )}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                  </div>

                  {selected.matchStatus.guardian && selected.matchStatus.student ? (
                    <button
                      onClick={() => handleReset(selectedSlot)}
                      className="w-full py-4 bg-accent-emerald text-white rounded-xl font-black text-xs tracking-[0.2em] uppercase hover:shadow-[0_0_20px_rgba(16,185,129,0.4)] transition-all cursor-pointer"
                    >
                      RELEASE STUDENT
                    </button>
                  ) : selected.matchStatus.guardian || selected.matchStatus.student ? (
                    <button
                      onClick={() => handleReset(selectedSlot)}
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
                <p className="text-[10px] text-text-secondary font-medium mt-3 max-w-[200px] mx-auto uppercase leading-relaxed opacity-60">
                  Waiting for biometric verification...
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Mini logs */}
          <div className="glass-card p-6">
            <h4 className="info-label mb-4 opacity-50">Recent History</h4>
            <div className="space-y-3">
              {allLogs.length > 0 ? allLogs.slice(0, 3).map((log, i) => (
                <div
                  key={i}
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
