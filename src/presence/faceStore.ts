/**
 * Face profile lives ONLY in this browser (localStorage), never in the database.
 * Each sample is 128 numbers describing a face — not a photo.
 *
 *  me      – snapshots of the student
 *  notMe   – snapshots of lookalikes (e.g. a sister) that must NOT count as her
 *  threshold – lower = stricter
 */
export type FaceProfile = { me: Float32Array[]; notMe: Float32Array[]; threshold: number };

export const STRICTNESS = [
  { label: 'Relaxed', value: 0.5 },
  { label: 'Normal', value: 0.45 },
  { label: 'Strict', value: 0.4 },
  { label: 'Very strict', value: 0.35 },
];
export const DEFAULT_THRESHOLD = 0.45;
const NOT_ME_MARGIN = 0.01; // must be at least this much closer to "me" than to "not me"
const MAX_NOT_ME = 12;

const key = (userId: string) => `sb.face.${userId}`;
const toF32 = (arr: number[][]) => arr.map((a) => Float32Array.from(a));
const toNum = (arr: Float32Array[]) => arr.map((a) => Array.from(a));

export function loadProfile(userId: string): FaceProfile | null {
  try {
    const raw = localStorage.getItem(key(userId));
    if (!raw) return null;
    const data = JSON.parse(raw);
    // v1 format was a plain array of "me" samples
    const p: FaceProfile = Array.isArray(data)
      ? { me: toF32(data), notMe: [], threshold: DEFAULT_THRESHOLD }
      : { me: toF32(data.me ?? []), notMe: toF32(data.notMe ?? []), threshold: data.threshold ?? DEFAULT_THRESHOLD };
    return p.me.length ? p : null;
  } catch {
    return null;
  }
}

export function saveProfile(userId: string, p: FaceProfile) {
  localStorage.setItem(
    key(userId),
    JSON.stringify({ me: toNum(p.me), notMe: toNum(p.notMe.slice(-MAX_NOT_ME)), threshold: p.threshold }),
  );
}

export function clearProfile(userId: string) {
  try {
    localStorage.removeItem(key(userId));
  } catch {
    /* ignore */
  }
}

function distance(a: Float32Array, b: Float32Array) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum);
}

/** Average of the 3 closest samples — one lucky snapshot can't make a match on its own. */
export function matchScore(d: Float32Array, samples: Float32Array[]): number {
  const ds = samples.map((s) => distance(d, s)).sort((a, b) => a - b);
  const k = Math.min(3, ds.length);
  return ds.slice(0, k).reduce((a, b) => a + b, 0) / k;
}

export type MatchResult = { isMe: boolean; score: number; otherScore: number | null; lookalike: boolean };

export function checkFace(d: Float32Array, p: FaceProfile): MatchResult {
  const score = matchScore(d, p.me);
  const otherScore = p.notMe.length ? matchScore(d, p.notMe) : null;
  const lookalike = otherScore !== null && otherScore < score + NOT_ME_MARGIN;
  return { isMe: score < p.threshold && !lookalike, score, otherScore, lookalike };
}
