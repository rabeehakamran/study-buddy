import type { Palette } from './PixelArt';

// ---------- Mascot: "Buddy", a lavender pixel cat with a bow ----------
export type Mood = 'happy' | 'focus' | 'sleep' | 'sad';

export const MASCOT_PALETTE: Palette = {
  o: '#2a1650', // outline
  w: '#efe9ff', // body
  s: '#cdbdf7', // shade
  e: '#2a1650', // eyes / mouth
  h: '#ffffff', // eye shine
  p: '#d8b4fe', // blush
  b: '#8b5cf6', // bow
  B: '#5b21b6', // bow knot
};

const HEAD_TOP = [
  '..o..........o..',
  '.owo.bb..bb.owo.',
  '.owwobbBBbbowwo.',
  '.owwwbboobbwwwo.',
  '.owwwwwwwwwwwwo.',
  'owwwwwwwwwwwwwwo',
];

const FACES: Record<Mood, string[]> = {
  happy: [
    'owwhewwwwwwhewwo',
    'owweewwwwwweewwo',
    'owpwwwewwewwwpwo',
    'owwwwwweewwwwwwo',
  ],
  focus: [
    'owwhewwwwwwhewwo',
    'owweewwwwwweewwo',
    'owpwwwweewwwwpwo',
    'owwwwwwwwwwwwwwo',
  ],
  sleep: [
    'owwwwwwwwwwwwwwo',
    'owweewwwwwweewwo',
    'owpwwwwwwwwwwpwo',
    'owwwwwweewwwwwwo',
  ],
  sad: [
    'owwhewwwwwwhewwo',
    'owweewwwwwweewwo',
    'owwwwwweewwwwwwo',
    'owwwwwewwewwwwwo',
  ],
};

const BODY_BOTTOM = [
  '.owwwwwwwwwwwwo.',
  '.osswwwwwwwwsso.',
  '..oossssssssoo..',
  '....oooooooo....',
];

export function mascotRows(mood: Mood): string[] {
  return [...HEAD_TOP, ...FACES[mood], ...BODY_BOTTOM];
}

// ---------- Scenery & icons ----------
export const TREE = [
  '..ttttt..',
  '.tttTttt.',
  'ttTtttttt',
  'tttttTttt',
  '.ttTtttt.',
  '..ttttt..',
  '....k....',
  '....k....',
  '...kkk...',
];
export const TREE_PALETTE: Palette = { t: '#6d28d9', T: '#a78bfa', k: '#3b2560' };

export const BUSH = ['.bbbb.', 'bbBbbb', 'bbbbBb'];
export const BUSH_PALETTE: Palette = { b: '#5b21b6', B: '#8b5cf6' };

export const FLOWER = ['.f.', 'fcf', '.f.', '.g.'];
export const FLOWER_PALETTE: Palette = { f: '#c4b5fd', c: '#f5f3ff', g: '#4c1d95' };

export const HEART = ['.hh.hh.', 'hHhhhhh', 'hhhhhhh', '.hhhhh.', '..hhh..', '...h...'];
export const HEART_PALETTE: Palette = { h: '#a78bfa', H: '#ede9fe' };
export const HEART_EMPTY_PALETTE: Palette = { h: '#2c2740', H: '#3a3352' };

export const SPARKLE = ['..s..', '..s..', 'sssss', '..s..', '..s..'];
export const SPARKLE_PALETTE: Palette = { s: '#c4b5fd' };

export const CLOUD = ['...cccc.....', '.cccccccc...', 'cccccccccccc'];
export const CLOUD_PALETTE: Palette = { c: '#1f1833' };
