import { useEffect, useRef } from 'react';
import { useScannerStore } from '../store/scannerStore';

export function useCamera() {
  const setAvailableDevices = useScannerStore((s) => s.setAvailableDevices);
  const setAssignedDevice = useScannerStore((s) => s.setAssignedDevice);
  const initializedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function discoverDevices(isInitial: boolean) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        const all = await navigator.mediaDevices.enumerateDevices();
        stream.getTracks().forEach((t) => t.stop());

        if (cancelled) return;

        const video = all.filter((d) => d.kind === 'videoinput');
        setAvailableDevices(video);

        // Auto-assign only on first load — don't override user's manual selections
        if (isInitial && !initializedRef.current) {
          initializedRef.current = true;
          const { assignedDevices } = useScannerStore.getState();
          video.slice(0, 3).forEach((d, i) => {
            const slot = i + 1;
            if (!assignedDevices[slot as 1 | 2 | 3]) {
              setAssignedDevice(slot as 1 | 2 | 3, d.deviceId);
            }
          });
        }
      } catch (err) {
        console.warn('Camera discovery failed:', err);
      }
    }

    discoverDevices(true);

    const handleDeviceChange = () => discoverDevices(false);
    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);

    return () => {
      cancelled = true;
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
    };
  }, [setAvailableDevices, setAssignedDevice]);
}
