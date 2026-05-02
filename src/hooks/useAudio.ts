import { useRef, useCallback } from 'react';

function createBeep(frequency: number, duration: number, type: OscillatorType = 'square') {
  try {
    const ctx = new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch {
    // Silently fail if AudioContext unavailable
  }
}

export function useAudio() {
  const lastBeepRef = useRef(0);

  const playWarningBeep = useCallback(() => {
    const now = Date.now();
    if (now - lastBeepRef.current < 2000) return;
    lastBeepRef.current = now;
    createBeep(440, 0.3);
  }, []);

  const playErrorBeep = useCallback(() => {
    createBeep(150, 0.5);
  }, []);

  const playSuccessBeep = useCallback(() => {
    createBeep(880, 0.2, 'sine');
  }, []);

  return { playWarningBeep, playErrorBeep, playSuccessBeep };
}
