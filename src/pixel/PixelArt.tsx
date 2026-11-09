/**
 * Tiny pixel-art renderer: each string is a row, each character a pixel.
 * '.' (or any char missing from the palette) is transparent.
 */
export type Palette = Record<string, string>;

type Run = { x: number; y: number; w: number; c: string };

function toRuns(rows: string[], palette: Palette): Run[] {
  const runs: Run[] = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const c = palette[row[x]];
      if (!c) {
        x++;
        continue;
      }
      let w = 1;
      while (x + w < row.length && row[x + w] === row[x]) w++;
      runs.push({ x, y, w, c });
      x += w;
    }
  });
  return runs;
}

/** A sprite inside an existing <svg> (used for scenes). */
export function Sprite({ rows, palette, x = 0, y = 0, className }: { rows: string[]; palette: Palette; x?: number; y?: number; className?: string }) {
  return (
    <g transform={`translate(${x} ${y})`} className={className}>
      {toRuns(rows, palette).map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={r.c} />
      ))}
    </g>
  );
}

/** A standalone sprite. Size it with className (e.g. "w-24"). */
export default function PixelArt({ rows, palette, className, label }: { rows: string[]; palette: Palette; className?: string; label?: string }) {
  const w = Math.max(...rows.map((r) => r.length));
  return (
    <svg
      viewBox={`0 0 ${w} ${rows.length}`}
      shapeRendering="crispEdges"
      className={className}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <Sprite rows={rows} palette={palette} />
    </svg>
  );
}
