import { FaceDetection } from '@mediapipe/face_detection';
import { Camera } from '@mediapipe/camera_utils';

export interface DetectedFace {
  x: number;
  y: number;
  width: number;
  height: number;
  score: number;
}

export class FaceDetector {
  private faceDetection: FaceDetection | null = null;
  private camera: Camera | null = null;

  async loadModel() {
    this.faceDetection = new FaceDetection({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/${file}`,
    });

    this.faceDetection.setOptions({
      model: 'short',
      minDetectionConfidence: 0.5,
    });

    await this.faceDetection.initialize();
  }

  async detectFaces(videoElement: HTMLVideoElement): Promise<DetectedFace[]> {
    if (!this.faceDetection) throw new Error('Model not loaded');

    const results = await this.faceDetection.send({ image: videoElement }) as unknown as { detections: { boundingBox: { xCenter: number; yCenter: number; width: number; height: number }; score: number[] }[] } | undefined;

    return (results?.detections ?? []).map((detection: { boundingBox: { xCenter: number; yCenter: number; width: number; height: number }; score: number[] }) => {
      const bbox = detection.boundingBox;
      return {
        x: bbox.xCenter - bbox.width / 2,
        y: bbox.yCenter - bbox.height / 2,
        width: bbox.width,
        height: bbox.height,
        score: detection.score[0],
      };
    });
  }

  startCamera(videoElement: HTMLVideoElement, onFrame: (results: DetectedFace[]) => void) {
    if (!this.faceDetection) throw new Error('Model not loaded');

    this.camera = new Camera(videoElement, {
      onFrame: async () => {
        const results = await this.detectFaces(videoElement);
        onFrame(results);
      },
      width: 640,
      height: 480,
    });

    this.camera.start();
  }

  stopCamera() {
    if (this.camera) {
      (this.camera as unknown as { stop: () => void }).stop();
    }
  }
}