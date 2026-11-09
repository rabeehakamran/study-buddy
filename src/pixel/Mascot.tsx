import PixelArt from './PixelArt';
import { HEART, HEART_PALETTE, MASCOT_PALETTE, SPARKLE, SPARKLE_PALETTE, mascotRows, type Mood } from './sprites';

const LABELS: Record<Mood, string> = {
  happy: 'Buddy the cat, smiling',
  focus: 'Buddy the cat, focusing',
  sleep: 'Buddy the cat, resting',
  sad: 'Buddy the cat, waiting for you',
};

export default function Mascot({ mood = 'happy', className = 'w-28' }: { mood?: Mood; className?: string }) {
  return (
    <div className={`relative inline-block ${className}`}>
      <PixelArt rows={mascotRows(mood)} palette={MASCOT_PALETTE} className="w-full animate-bob" label={LABELS[mood]} />

      {mood === 'happy' && (
        <PixelArt rows={HEART} palette={HEART_PALETTE} className="absolute -right-5 -top-3 w-[22%] animate-twinkle" />
      )}
      {mood === 'focus' && (
        <>
          <PixelArt rows={SPARKLE} palette={SPARKLE_PALETTE} className="absolute -left-4 top-0 w-[16%] animate-twinkle" />
          <PixelArt rows={SPARKLE} palette={SPARKLE_PALETTE} className="absolute -right-3 top-6 w-[12%] animate-twinkle [animation-delay:0.8s]" />
        </>
      )}
      {mood === 'sleep' && (
        <span className="font-pixel absolute -right-6 -top-4 text-lg font-bold text-primary animate-twinkle" aria-hidden>
          z<span className="text-sm">z</span>
        </span>
      )}
      {mood === 'sad' && (
        <span className="font-pixel absolute -right-5 -top-4 text-xl font-bold text-primary animate-twinkle" aria-hidden>
          ?
        </span>
      )}
    </div>
  );
}
