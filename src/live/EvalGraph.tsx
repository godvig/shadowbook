// The evaluation over the whole game: White's share per move, mistakes and blunders as dots. Click to jump.
import type { Mark } from '../eval/marks';

const W = 600;
const H = 80;

export function EvalGraph({ points, marks, ply, onPly }: { points: (number | null)[]; marks: (Mark | undefined)[]; ply: number; onPly: (ply: number) => void }) {
  const n = Math.max(1, points.length - 1);
  const x = (i: number) => (i / n) * W;
  const y = (v: number) => (1 - v) * H;
  // Missing evaluations break the line rather than pretending the game was equal there.
  const segments: string[] = [];
  let open = '';
  points.forEach((v, i) => {
    if (v === null) {
      if (open) segments.push(open);
      open = '';
    } else open += `${open ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
  });
  if (open) segments.push(open);
  const area = segments.map((d) => {
    const xs = [...d.matchAll(/[ML]([\d.]+),/g)].map((m) => m[1]);
    return `${d}L${xs.at(-1)},${H}L${xs[0]},${H}Z`;
  });
  const pick = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    onPly(Math.round(((e.clientX - r.left) / r.width) * n));
  };
  return (
    <svg className="lv-graph" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" onClick={pick} role="img" aria-label="Evaluation over the game. Click to jump to a move.">
      <rect className="bg" width={W} height={H} />
      {area.map((d, i) => (
        <path key={i} className="area" d={d} />
      ))}
      <line className="zero" x1={0} x2={W} y1={H / 2} y2={H / 2} />
      {segments.map((d, i) => (
        <path key={i} className="line" d={d} />
      ))}
      <line className="cursor" x1={x(ply)} x2={x(ply)} y1={0} y2={H} />
      {marks.map((m, i) =>
        (m === '?' || m === '??') && points[i + 1] !== null ? <circle key={i} className={m === '??' ? 'blunder' : 'mistake'} cx={x(i + 1)} cy={y(points[i + 1]!)} r={4} vectorEffect="non-scaling-stroke" /> : null,
      )}
    </svg>
  );
}
