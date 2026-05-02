/* eslint-disable no-restricted-globals */
/**
 * Off-main-thread descriptor matching worker.
 * Face DETECTION (CNN) stays on main thread (needs DOM/video).
 * Descriptor MATCHING (pure math) runs here to keep UI thread free.
 */

interface LabeledDesc {
  id: string;
  descriptors: number[][];
}

interface WorkerMatch {
  type: 'student' | 'guardian' | 'unknown';
  entryId?: string;
  guardianIndex?: number;
  distance?: number;
}

type Msg =
  | { type: 'init_registry'; studentLabels: LabeledDesc[]; guardianLabels: LabeledDesc[] }
  | { type: 'match_batch'; requestId: string; descriptors: number[][] };

let studentLabels: LabeledDesc[] = [];
let guardianLabels: LabeledDesc[] = [];

function euclideanDist(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < 128; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

function bestMatch(
  descriptor: number[],
  labels: LabeledDesc[],
  threshold: number
): { id: string; distance: number } | null {
  let best: { id: string; distance: number } | null = null;
  for (const { id, descriptors } of labels) {
    for (const d of descriptors) {
      const dist = euclideanDist(descriptor, d);
      if (dist < threshold && (!best || dist < best.distance)) {
        best = { id, distance: dist };
      }
    }
  }
  return best;
}

function matchOne(descriptor: number[]): WorkerMatch {
  const sm = bestMatch(descriptor, studentLabels, 0.45);
  if (sm) return { type: 'student', entryId: sm.id, distance: sm.distance };

  const gm = bestMatch(descriptor, guardianLabels, 0.45);
  if (gm) {
    const [pid, gidxStr] = gm.id.split('_');
    return {
      type: 'guardian',
      entryId: pid,
      guardianIndex: parseInt(gidxStr, 10),
      distance: gm.distance,
    };
  }

  return { type: 'unknown' };
}

self.addEventListener('message', (event: MessageEvent<Msg>) => {
  const msg = event.data;

  if (msg.type === 'init_registry') {
    studentLabels = msg.studentLabels;
    guardianLabels = msg.guardianLabels;
    self.postMessage({ type: 'ready' });
    return;
  }

  if (msg.type === 'match_batch') {
    const matches: WorkerMatch[] = msg.descriptors.map(matchOne);
    self.postMessage({ type: 'batch_result', requestId: msg.requestId, matches });
  }
});
