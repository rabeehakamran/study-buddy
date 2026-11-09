import type { ReactNode } from 'react';
import PixelArt from '../pixel/PixelArt';
import { HEART, HEART_PALETTE, SPARKLE, SPARKLE_PALETTE } from '../pixel/sprites';

/** Page title with a tiny pixel illustration (plus twinkly sparkle + heart). */
export default function PageHeader({ title, subtitle, art }: { title: string; subtitle?: string; art: ReactNode }) {
  return (
    <div className="flex items-center gap-4">
      <div className="relative w-14 shrink-0 sm:w-16" aria-hidden>
        <div className="animate-bob">{art}</div>
        <PixelArt rows={SPARKLE} palette={SPARKLE_PALETTE} className="absolute -right-3 -top-2 w-3 animate-twinkle" />
        <PixelArt rows={HEART} palette={HEART_PALETTE} className="absolute -bottom-1 -left-2 w-3.5 animate-twinkle [animation-delay:1.2s]" />
      </div>
      <div>
        <h1 className="text-3xl font-bold">{title}</h1>
        {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
      </div>
    </div>
  );
}
