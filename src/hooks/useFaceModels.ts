import { useEffect } from 'react';
import * as faceapi from 'face-api.js';
import { useUIStore } from '../store/uiStore';

const MODEL_URL =
  'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';

export function useFaceModels() {
  const setModelsLoaded = useUIStore((s) => s.setModelsLoaded);

  useEffect(() => {
    let cancelled = false;

    async function loadModels() {
      try {
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);
        if (!cancelled) setModelsLoaded(true);
      } catch (err) {
        console.error('Face model loading failed:', err);
      }
    }

    loadModels();
    return () => { cancelled = true; };
  }, [setModelsLoaded]);
}
