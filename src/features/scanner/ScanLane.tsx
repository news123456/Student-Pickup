import React, {
  useRef, useState, useEffect, useCallback, memo,
} from 'react';
import * as faceapi from 'face-api.js';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useRegistryStore } from '../../store/registryStore';
import { useScannerStore } from '../../store/scannerStore';
import { useHistoryStore } from '../../store/historyStore';
import { useAudio } from '../../hooks/useAudio';
import type { RegistryEntry, WorkerMatch, LaneState, PickupLog } from '../../types';

// Singleton worker shared across all lanes
let _worker: Worker | null = null;
function getWorker(): Worker {
  if (!_worker) {
    _worker = new Worker(new URL('../../workers/faceWorker.ts', import.meta.url), {
      type: 'module',
    });
  }
  return _worker;
}

interface DetOverlay {
  label: string;
  isMatch: boolean;
  box: { x: number; y: number; width: number; height: number };
}

interface Props {
  slot: number;
  deviceId?: string;
  cameraLabel: string;
}

export const ScanLane = memo(({ slot, deviceId, cameraLabel }: Props) => {
  const registry = useRegistryStore((s) => s.registry);
  const updateLane = useScannerStore((s) => s.updateLane);
  const laneState = useScannerStore((s) => s.laneStates[slot]);
  const addLog = useHistoryStore((s) => s.addLog);
  const { playWarningBeep } = useAudio();

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastMatchRef = useRef({ key: '', time: 0 });
  const pendingRef = useRef(false);

  const [overlays, setOverlays] = useState<DetOverlay[]>([]);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Push registry to worker whenever it changes
  useEffect(() => {
    if (registry.length === 0) return;
    const studentLabels = registry
      .filter((e) => e.studentFaceDescriptor?.length === 128)
      .map((e) => ({ id: e.id, descriptors: [e.studentFaceDescriptor] }));
    const guardianLabels = registry.flatMap((e) =>
      (e.guardians ?? [])
        .filter((g) => g.faceDescriptor?.length === 128)
        .map((g, idx) => ({ id: `${e.id}_${idx}`, descriptors: [g.faceDescriptor] }))
    );
    getWorker().postMessage({ type: 'init_registry', studentLabels, guardianLabels });
  }, [registry]);

  // Camera lifecycle
  const startCamera = useCallback(
    async (retry = 0) => {
      setErrorMsg(null);
      try {
        if (retry === 0) {
          const idx = parseInt(cameraLabel.match(/\d+/)?.[0] ?? '0', 10);
          await new Promise<void>((r) => setTimeout(r, idx * 600));
        }
        streamRef.current?.getTracks().forEach((t) => t.stop());
        const c: MediaTrackConstraints = { width: { ideal: 640 }, height: { ideal: 480 } };
        if (deviceId) c.deviceId = retry === 0 ? { exact: deviceId } : deviceId;
        const stream = await navigator.mediaDevices.getUserMedia({ video: c });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          streamRef.current = stream;
          setIsCameraActive(true);
        }
      } catch (err) {
        if (retry < 2) { setTimeout(() => startCamera(retry + 1), 1000); return; }
        setErrorMsg(err instanceof Error ? err.message : String(err));
        setIsCameraActive(false);
      }
    },
    [deviceId, cameraLabel]
  );

  useEffect(() => {
    startCamera();
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      setIsCameraActive(false);
    };
  }, [deviceId, startCamera]);

  // Handle worker match results — reads state via getState() to avoid nested store mutations
  const handleMatch = useCallback(
    (entry: RegistryEntry, match: WorkerMatch) => {
      const type = match.type as 'student' | 'guardian';
      const guardianIdx = match.guardianIndex;
      const matchKey = `${entry.id}_${type}_${guardianIdx ?? 0}`;
      const now = Date.now();

      if (matchKey === lastMatchRef.current.key && now - lastMatchRef.current.time < 3000) return;
      lastMatchRef.current = { key: matchKey, time: now };

      // Read current lane state synchronously — no closure over stale state
      const lane = useScannerStore.getState().laneStates[slot];
      const isNewEntry = !lane.matchedEntry || lane.matchedEntry.id !== entry.id;
      const newEntry = isNewEntry ? entry : lane.matchedEntry!;
      const newStatus: LaneState['matchStatus'] = isNewEntry
        ? {
            guardian: type === 'guardian',
            student: type === 'student',
            guardianIndex: type === 'guardian' ? guardianIdx : undefined,
          }
        : {
            guardian: lane.matchStatus.guardian || type === 'guardian',
            student: lane.matchStatus.student || type === 'student',
            guardianIndex: type === 'guardian' ? guardianIdx : lane.matchStatus.guardianIndex,
          };

      // Log pickup when BOTH are verified for the first time in this lane
      if (newStatus.guardian && newStatus.student && !(lane.matchStatus.guardian && lane.matchStatus.student)) {
        const guardian = entry.guardians[newStatus.guardianIndex!];
        addLog({
          id: crypto.randomUUID(),
          studentName: entry.childName,
          guardianName: guardian?.name ?? 'Guardian',
          guardianRole: guardian?.role ?? 'Guardian',
          scholarNo: entry.scholarNo,
          classSec: entry.classSec,
          timestamp: Date.now(),
          cameraLabel: `Node 0${slot}`,
        });
      }

      // Update scanner store after addLog — no nesting
      useScannerStore.getState().updateLane(slot, { matchedEntry: newEntry, matchStatus: newStatus });
    },
    [slot, addLog]
  );

  // Face detection + worker dispatch loop
  useEffect(() => {
    if (registry.length === 0) return;
    const worker = getWorker();
    let rafId: number;
    let lastProcessed = 0;
    let isProcessing = false;

    const onWorkerMsg = (e: MessageEvent) => {
      const msg = e.data as { type: string; requestId: string; matches: WorkerMatch[] };
      if (!msg.requestId?.startsWith(`${slot}_`)) return;
      pendingRef.current = false;

      const matches: WorkerMatch[] = msg.matches ?? [];
      matches.forEach((m, i) => {
        if ((m.type === 'student' || m.type === 'guardian') && m.entryId) {
          const entry = registry.find((r) => r.id === m.entryId);
          if (entry) handleMatch(entry, m);
        }
        // Warn on unknown faces
        if (m.type === 'unknown' && i === 0) playWarningBeep();
      });
    };

    worker.addEventListener('message', onWorkerMsg);

    const loop = async (time: number) => {
      if (document.visibilityState !== 'visible' || isProcessing) {
        rafId = requestAnimationFrame(loop);
        return;
      }
      if (time - lastProcessed < 100 || !videoRef.current?.videoWidth) {
        rafId = requestAnimationFrame(loop);
        return;
      }

      isProcessing = true;
      lastProcessed = time;

      try {
        const dets = await faceapi
          .detectAllFaces(
            videoRef.current,
            new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.6 })
          )
          .withFaceLandmarks()
          .withFaceDescriptors();

        const newOverlays: DetOverlay[] = dets.map((d) => ({
          label: 'Scanning',
          isMatch: false,
          box: d.detection.box,
        }));
        setOverlays(newOverlays);

        if (dets.length > 0 && !pendingRef.current) {
          pendingRef.current = true;
          const descriptors = dets.map((d) => Array.from(d.descriptor));
          worker.postMessage({
            type: 'match_batch',
            requestId: `${slot}_${Date.now()}`,
            descriptors,
          });
        }
      } catch {
        // Ignore per-frame errors
      } finally {
        isProcessing = false;
        rafId = requestAnimationFrame(loop);
      }
    };

    rafId = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafId);
      worker.removeEventListener('message', onWorkerMsg);
    };
  }, [registry, slot, handleMatch, playWarningBeep]);

  return (
    <div className="w-full h-full relative bg-slate-900 group overflow-hidden">
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="w-full h-full object-cover opacity-80 transition-opacity group-hover:opacity-100"
      />

      {/* Detection overlays */}
      <AnimatePresence>
        {overlays.map((det, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="absolute border-2 pointer-events-none"
            style={{
              left: `${(det.box.x / (videoRef.current?.videoWidth || 1)) * 100}%`,
              top: `${(det.box.y / (videoRef.current?.videoHeight || 1)) * 100}%`,
              width: `${(det.box.width / (videoRef.current?.videoWidth || 1)) * 100}%`,
              height: `${(det.box.height / (videoRef.current?.videoHeight || 1)) * 100}%`,
              borderColor: det.isMatch ? '#10b981' : '#ef4444',
              borderRadius: '16px',
              boxShadow: det.isMatch
                ? '0 0 0 4px rgba(16,185,129,0.2)'
                : '0 0 0 4px rgba(239,68,68,0.2)',
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
              <div className="absolute -top-8 left-0 bg-red-500 text-white text-[8px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full flex items-center space-x-2">
                <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                <span>Unknown</span>
              </div>
            )}
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Scan line when idle */}
      {overlays.length === 0 && (
        <motion.div
          animate={{ top: ['10%', '90%', '10%'] }}
          transition={{ repeat: Infinity, duration: 3.5, ease: 'linear' }}
          className="absolute left-0 right-0 h-px bg-white/20 z-20 pointer-events-none"
        />
      )}

      {/* Camera label */}
      <div className="absolute top-4 left-4 z-20 flex flex-col space-y-2">
        <div className="px-3 py-1 bg-white/90 backdrop-blur-md rounded-full text-[9px] font-black tracking-widest text-slate-800 uppercase shadow-sm">
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

      {/* Lane status badge */}
      {laneState?.matchedEntry && (
        <div className="absolute top-4 right-20 z-20">
          <div className={cn(
            'px-2 py-1 rounded-full text-[8px] font-black uppercase tracking-widest',
            laneState.matchStatus.guardian && laneState.matchStatus.student
              ? 'bg-accent-emerald text-white'
              : 'bg-amber-500 text-black'
          )}>
            {laneState.matchStatus.guardian && laneState.matchStatus.student ? '✓ CLEARED' : '⏳ PENDING'}
          </div>
        </div>
      )}

      {/* Active stream indicator */}
      <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between z-20">
        <div className="bg-white/10 backdrop-blur-md px-3 py-1 rounded-full border border-white/5 flex items-center space-x-2">
          <div className={cn('w-1.5 h-1.5 rounded-full', isCameraActive ? 'bg-accent-emerald animate-pulse' : 'bg-red-500')} />
          <p className="text-[8px] font-bold tracking-widest text-white/80 uppercase">
            {isCameraActive ? 'Active Stream' : 'No Signal'}
          </p>
        </div>
      </div>
    </div>
  );
});

ScanLane.displayName = 'ScanLane';
