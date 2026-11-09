/**
 * Enrolled face samples live ONLY in this browser (localStorage), never in the database.
 * They are 128 numbers per sample — not photos.
 */
export const MATCH_THRESHOLD = 0.5; // lower = stricter (face-api default is 0.6)

const key = (userId: string) => `sb.face.${userId}`;

export function loadFace(userId: string): Float32Array[] | null {
  try {
    const raw = localStorage.getItem(key(userId));
    if (!raw) return null;
    const arr = JSON.parse(raw) as number[][];
    return arr.length ? arr.map((a) => Float32Array.from(a)) : null;
  } catch {
    return null;
  }
}

export function saveFace(userId: string, samples: Float32Array[]) {
  localStorage.setItem(key(userId), JSON.stringify(samples.map((s) => Array.from(s))));
}

export function clearFace(userId: string) {
  try {
    localStorage.removeItem(key(userId));
  } catch {
    /* ignore */
  }
}

export function bestDistance(d: Float32Array, samples: Float32Array[]): number {
  let best = Infinity;
  for (const s of samples) {
    let sum = 0;
    for (let i = 0; i < s.length; i++) sum += (d[i] - s[i]) ** 2;
    best = Math.min(best, Math.sqrt(sum));
  }
  return best;
}
