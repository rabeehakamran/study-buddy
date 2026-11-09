import { Sprite } from './PixelArt';
import {
  BUSH,
  BUSH_PALETTE,
  CLOUD,
  CLOUD_PALETTE,
  FLOWER,
  FLOWER_PALETTE,
  HEART,
  HEART_PALETTE,
  SPARKLE,
  SPARKLE_PALETTE,
  TREE,
  TREE_PALETTE,
} from './sprites';

const W = 160;
const H = 30;
const BUMPS = [0, 0, 1, 0, 1, 1, 0, 2, 1, 0, 0, 1];

/** Decorative pixel landscape strip (purple trees, flowers, sparkles). */
export default function PixelScene({ className = '' }: { className?: string }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} shapeRendering="crispEdges" className={`block w-full ${className}`} aria-hidden>
      <Sprite rows={CLOUD} palette={CLOUD_PALETTE} x={22} y={3} />
      <Sprite rows={CLOUD} palette={CLOUD_PALETTE} x={118} y={6} />

      <Sprite rows={SPARKLE} palette={SPARKLE_PALETTE} x={46} y={5} className="animate-twinkle" />
      <Sprite rows={SPARKLE} palette={SPARKLE_PALETTE} x={104} y={2} className="animate-twinkle [animation-delay:1s]" />
      <Sprite rows={HEART} palette={HEART_PALETTE} x={140} y={1} className="animate-twinkle [animation-delay:0.5s]" />
      <Sprite rows={HEART} palette={HEART_PALETTE} x={8} y={8} className="animate-twinkle [animation-delay:1.6s]" />

      <Sprite rows={TREE} palette={TREE_PALETTE} x={3} y={16} />
      <Sprite rows={TREE} palette={TREE_PALETTE} x={14} y={15} />
      <Sprite rows={BUSH} palette={BUSH_PALETTE} x={26} y={22} />
      <Sprite rows={TREE} palette={TREE_PALETTE} x={136} y={15} />
      <Sprite rows={TREE} palette={TREE_PALETTE} x={147} y={16} />
      <Sprite rows={BUSH} palette={BUSH_PALETTE} x={127} y={22} />
      {[38, 52, 61, 98, 110, 119].map((x) => (
        <Sprite key={x} rows={FLOWER} palette={FLOWER_PALETTE} x={x} y={21} />
      ))}

      {/* bumpy ground */}
      {Array.from({ length: W }, (_, x) => {
        const top = 25 - BUMPS[x % BUMPS.length];
        return (
          <g key={x}>
            <rect x={x} y={top} width={1} height={1} fill="#6d28d9" />
            <rect x={x} y={top + 1} width={1} height={H - top - 1} fill="#2e1a4f" />
          </g>
        );
      })}
    </svg>
  );
}
