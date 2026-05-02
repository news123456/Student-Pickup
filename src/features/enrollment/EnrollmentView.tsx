import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as faceapi from 'face-api.js';
import { motion } from 'motion/react';
import { Camera, UserPlus, Loader2, Trash2, AlertTriangle } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useRegistryStore } from '../../store/registryStore';
import { useAudio } from '../../hooks/useAudio';
import type { Guardian, RegistryEntry } from '../../types';

type Step = 'details' | 'student' | 'guardians';
type Role = 'Father' | 'Mother' | 'Guardian';

function InputGroup({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-2">
      <label className="info-label px-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        className="w-full bg-surface border border-surface-border rounded-xl px-5 py-4 text-sm font-bold text-text-primary placeholder:text-text-secondary/30 placeholder:font-normal focus:ring-1 focus:ring-accent-emerald/50 focus:border-accent-emerald outline-none transition-all shadow-sm"
        placeholder={`ENTER ${label.toUpperCase()}...`}
      />
    </div>
  );
}

export default function EnrollmentView() {
  const addEntry = useRegistryStore((s) => s.addEntry);
  const { playErrorBeep } = useAudio();

  const [form, setForm] = useState({ childName: '', scholarNo: '', classSec: '' });
  const [step, setStep] = useState<Step>('details');
  const [isCapturing, setIsCapturing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [enrollmentError, setEnrollmentError] = useState<string | null>(null);
  const [studentDescriptor, setStudentDescriptor] = useState<number[] | null>(null);
  const [studentPhoto, setStudentPhoto] = useState<string | null>(null);
  const [guardians, setGuardians] = useState<Omit<Guardian, 'id'>[]>([]);
  const [currentRole, setCurrentRole] = useState<Role | null>(null);
  const [currentName, setCurrentName] = useState('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!isCapturing || !videoRef.current || streamRef.current) return;
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' } })
      .then((s) => {
        if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
        if (videoRef.current) { videoRef.current.srcObject = s; streamRef.current = s; }
      })
      .catch(() => { setIsCapturing(false); alert('Camera access denied.'); });
    return () => { cancelled = true; };
  }, [isCapturing]);

  useEffect(() => () => { streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; }, []);

  const captureDescriptor = useCallback(async (): Promise<{ descriptor: number[]; photo: string } | null> => {
    if (!videoRef.current) return null;
    const det = await faceapi
      .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.6 }))
      .withFaceLandmarks()
      .withFaceDescriptor();
    if (!det) return null;

    const canvas = document.createElement('canvas');
    canvas.width = 200; canvas.height = 200;
    const ctx = canvas.getContext('2d')!;
    const v = videoRef.current;
    const size = Math.min(v.videoWidth, v.videoHeight);
    ctx.drawImage(v, (v.videoWidth - size) / 2, (v.videoHeight - size) / 2, size, size, 0, 0, 200, 200);
    return { descriptor: Array.from(det.descriptor), photo: canvas.toDataURL('image/jpeg', 0.8) };
  }, []);

  const handleCapture = useCallback(async () => {
    if (!videoRef.current || !streamRef.current) return;
    setIsProcessing(true);
    setEnrollmentError(null);
    try {
      const result = await captureDescriptor();
      if (!result) {
        setEnrollmentError('FACE NOT DETECTED: PLEASE ADJUST FRAMING');
        playErrorBeep();
        return;
      }

      if (step === 'guardians' && studentDescriptor) {
        const dist = faceapi.euclideanDistance(
          new Float32Array(result.descriptor),
          new Float32Array(studentDescriptor)
        );
        if (dist < 0.45) {
          setEnrollmentError('SECURITY ALERT: GUARDIAN MATCHES STUDENT. USE SEPARATE INDIVIDUALS.');
          playErrorBeep();
          return;
        }
      }

      if (step === 'student') {
        setStudentDescriptor(result.descriptor);
        setStudentPhoto(result.photo);
      } else if (step === 'guardians' && currentRole) {
        setGuardians((prev) => [
          ...prev,
          { role: currentRole, name: currentName || currentRole, faceDescriptor: result.descriptor, photo: result.photo },
        ]);
        setCurrentRole(null);
        setCurrentName('');
      }
    } catch {
      setEnrollmentError('SCANNER ERROR: RESETTING INTERFACE');
    } finally {
      setIsProcessing(false);
    }
  }, [step, studentDescriptor, currentRole, currentName, captureDescriptor, playErrorBeep]);

  const handleFinalize = useCallback(() => {
    if (!studentDescriptor || guardians.length === 0) return;
    const entry: RegistryEntry = {
      id: crypto.randomUUID(),
      childName: form.childName,
      scholarNo: form.scholarNo,
      classSec: form.classSec,
      studentFaceDescriptor: studentDescriptor,
      studentPhoto: studentPhoto ?? undefined,
      guardians: guardians as Guardian[],
      createdAt: Date.now(),
    };
    addEntry(entry);
    setForm({ childName: '', scholarNo: '', classSec: '' });
    setStep('details');
    setStudentDescriptor(null);
    setStudentPhoto(null);
    setGuardians([]);
    setIsCapturing(false);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    alert('Enrollment complete.');
  }, [studentDescriptor, guardians, form, studentPhoto, addEntry]);

  const roles: Role[] = ['Father', 'Mother', 'Guardian'];
  const steps = [{ id: 'details', label: 'Details' }, { id: 'student', label: 'Student' }, { id: 'guardians', label: 'Guardians' }];

  return (
    <motion.div
      key="register"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="max-w-4xl mx-auto"
    >
      <div className="glass-card overflow-hidden">
        <div className="p-6 sm:p-10 border-b border-surface-border">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
            <h2 className="text-xl sm:text-2xl font-extrabold text-text-primary tracking-tight flex items-center space-x-3 uppercase">
              <UserPlus className="w-6 h-6 sm:w-8 sm:h-8 text-accent-emerald" />
              <span>Secure Biometric Enrollment</span>
            </h2>
            <div className="status-badge text-accent-emerald bg-accent-emerald-alpha self-start sm:self-center">Multi-Guardian v3.0</div>
          </div>
          <p className="text-text-secondary text-[10px] sm:text-xs font-medium max-w-lg">
            Enroll the student and multiple authorized guardians for flexible and secure identity verification.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 lg:divide-x lg:divide-surface-border">
          {/* Form column */}
          <div className="p-6 sm:p-10 space-y-8">
            {/* Step indicator */}
            <div className="flex items-center space-x-2 mb-4">
              {steps.map((s, i) => (
                <React.Fragment key={s.id}>
                  <div className={cn(
                    'text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded',
                    step === s.id ? 'bg-accent-emerald text-black' : 'text-text-secondary bg-white/5'
                  )}>{s.label}</div>
                  {i < 2 && <div className="w-4 h-[1px] bg-white/10" />}
                </React.Fragment>
              ))}
            </div>

            <div className="space-y-5">
              {enrollmentError && (
                <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                  className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                  <div className="flex items-center space-x-2 text-red-500">
                    <AlertTriangle className="w-4 h-4" />
                    <p className="text-[10px] font-black uppercase tracking-widest">{enrollmentError}</p>
                  </div>
                </motion.div>
              )}

              {step === 'details' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
                  <InputGroup label="Student Full Name" value={form.childName} onChange={(v) => setForm((f) => ({ ...f, childName: v }))} />
                  <div className="grid grid-cols-2 gap-4">
                    <InputGroup label="Scholar Number" value={form.scholarNo} onChange={(v) => setForm((f) => ({ ...f, scholarNo: v }))} />
                    <InputGroup label="Grade & Section" value={form.classSec} onChange={(v) => setForm((f) => ({ ...f, classSec: v }))} />
                  </div>
                  <button
                    onClick={() => setStep('student')}
                    disabled={!form.childName || !form.scholarNo}
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
                          <p className="text-xs text-text-primary font-bold uppercase">{form.childName}</p>
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
                    <h4 className="text-xs font-bold text-text-primary uppercase tracking-widest px-1">
                      Authorized Guardians ({guardians.length})
                    </h4>
                    <div className="space-y-2">
                      {guardians.map((g, i) => (
                        <div key={i} className="flex items-center justify-between p-3 bg-surface border border-surface-border rounded-lg">
                          <div className="flex items-center space-x-3">
                            {g.photo && <img src={g.photo} className="w-8 h-8 rounded border border-surface-border" alt="Guardian" />}
                            <div>
                              <p className="text-[10px] font-bold text-text-primary uppercase">{g.name}</p>
                              <p className="text-[8px] font-black text-accent-emerald uppercase tracking-widest">{g.role}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => setGuardians((prev) => prev.filter((_, idx) => idx !== i))}
                            className="p-2 text-white/20 hover:text-red-500 transition-all"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {!currentRole ? (
                    <div className="space-y-4 pt-4 border-t border-white/5">
                      <p className="text-[10px] font-black text-text-secondary uppercase tracking-[0.2em] text-center mb-4">
                        Add New Authorized Person
                      </p>
                      <div className="grid grid-cols-3 gap-3">
                        {roles.map((role) => (
                          <button
                            key={role}
                            onClick={() => setCurrentRole(role)}
                            disabled={guardians.some((g) => g.role === role)}
                            className="py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[9px] font-black uppercase tracking-widest text-white transition-all disabled:opacity-20"
                          >
                            {role}
                          </button>
                        ))}
                      </div>
                      {guardians.length > 0 && (
                        <button
                          onClick={handleFinalize}
                          className="w-full py-5 bg-accent-emerald text-black rounded-xl font-black text-xs tracking-[0.2em] uppercase mt-4 hover:shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all"
                        >
                          Finalize Enrollment
                        </button>
                      )}
                    </div>
                  ) : (
                    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                      className="space-y-5 p-6 bg-surface border border-surface-border rounded-2xl shadow-sm">
                      <div className="flex justify-between items-center mb-2">
                        <p className="text-[10px] font-black text-accent-emerald uppercase tracking-widest">Enrolling: {currentRole}</p>
                        <button onClick={() => setCurrentRole(null)} className="text-[8px] font-bold text-text-secondary uppercase hover:text-text-primary transition-colors cursor-pointer">Cancel</button>
                      </div>
                      <InputGroup label={`${currentRole} Full Name`} value={currentName} onChange={setCurrentName} />
                      <button
                        onClick={handleCapture}
                        disabled={!isCapturing || isProcessing}
                        className="w-full py-4 bg-text-primary text-background rounded-xl font-black text-[10px] tracking-[0.2em] uppercase transition-all flex items-center justify-center space-x-2 shadow-lg"
                      >
                        {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <span>Capture {currentRole} Face</span>}
                      </button>
                    </motion.div>
                  )}
                </motion.div>
              )}
            </div>
          </div>

          {/* Camera column */}
          <div className="bg-background/20 p-6 sm:p-10 flex flex-col items-center justify-center transition-all">
            {!isCapturing && step !== 'details' ? (
              <button
                onClick={() => setIsCapturing(true)}
                className="w-full aspect-[4/5] sm:aspect-square lg:aspect-[4/5] border-2 border-dashed border-surface-border rounded-3xl hover:border-accent-emerald/40 hover:bg-accent-emerald/5 transition-all group flex flex-col items-center justify-center cursor-pointer bg-surface/30"
              >
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-surface flex items-center justify-center group-hover:bg-accent-emerald/20 transition-all border border-surface-border shadow-sm">
                  <Camera className="w-6 h-6 sm:w-8 sm:h-8 text-text-secondary group-hover:text-accent-emerald" />
                </div>
                <p className="text-[9px] sm:text-[11px] font-black text-text-secondary mt-6 group-hover:text-text-primary uppercase tracking-[0.25em]">
                  ACTIVATE SENSOR
                </p>
              </button>
            ) : isCapturing ? (
              <div className="relative w-full aspect-[4/5] sm:aspect-square lg:aspect-[4/5] rounded-[2.5rem] overflow-hidden bg-slate-900 shadow-2xl ring-4 ring-surface-border ring-inset ring-offset-8 ring-offset-background">
                <video ref={videoRef} autoPlay muted className="w-full h-full object-cover" />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-32 h-48 sm:w-48 sm:h-64 border-2 border-accent-emerald/20 rounded-[80px] shadow-[0_0_100px_rgba(16,185,129,0.1)]" />
                </div>
                <div className="absolute top-4 right-4 bg-accent-emerald text-black text-[10px] font-bold px-2 py-1 rounded uppercase">
                  Biometric Stream
                </div>
              </div>
            ) : (
              <div className="w-full aspect-[4/5] sm:aspect-square lg:aspect-[4/5] bg-surface/50 rounded-3xl flex items-center justify-center border border-white/5">
                <p className="text-text-secondary text-[10px] font-bold uppercase tracking-widest text-center leading-relaxed">
                  Enrollment parameters required<br />prior to sensor initialization
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
