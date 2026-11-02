import { diffDays, formatShort } from "@/lib/date";
import type { TrendPoint } from "@/lib/calc";

interface Props {
  points: TrendPoint[]; // 已按日期升序
  targetKg?: number | null;
}

const W = 320;
const H = 180;
const PAD = { l: 36, r: 12, t: 12, b: 24 };

export default function WeightChart({ points, targetKg }: Props) {
  if (points.length < 2) {
    return (
      <p className="py-8 text-center text-sm text-slate-400">
        記錄 2 日或以上先會顯示趨勢圖。
      </p>
    );
  }

  const first = points[0].date;
  const last = points[points.length - 1].date;
  const span = Math.max(1, diffDays(first, last));

  const values = points.flatMap((p) => [p.weight, p.avg]);
  if (targetKg) values.push(targetKg);
  let min = Math.min(...values);
  let max = Math.max(...values);
  const margin = Math.max(0.5, (max - min) * 0.15);
  min -= margin;
  max += margin;

  const x = (date: string) =>
    PAD.l + (diffDays(first, date) / span) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + ((max - v) / (max - min)) * (H - PAD.t - PAD.b);

  const avgPath = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.date).toFixed(1)},${y(p.avg).toFixed(1)}`)
    .join(" ");

  const ticks = [max, (max + min) / 2, min];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="體重趨勢圖">
      {ticks.map((t) => (
        <g key={t}>
          <line
            x1={PAD.l}
            x2={W - PAD.r}
            y1={y(t)}
            y2={y(t)}
            stroke="#e2e8f0"
            strokeWidth="1"
          />
          <text x={PAD.l - 4} y={y(t) + 4} textAnchor="end" fontSize="10" fill="#94a3b8">
            {t.toFixed(1)}
          </text>
        </g>
      ))}
      {targetKg ? (
        <g>
          <line
            x1={PAD.l}
            x2={W - PAD.r}
            y1={y(targetKg)}
            y2={y(targetKg)}
            stroke="#f59e0b"
            strokeWidth="1"
            strokeDasharray="4 3"
          />
          <text x={W - PAD.r} y={y(targetKg) - 3} textAnchor="end" fontSize="10" fill="#d97706">
            目標 {targetKg}
          </text>
        </g>
      ) : null}
      {points.map((p) => (
        <circle key={p.date} cx={x(p.date)} cy={y(p.weight)} r="2.5" fill="#94a3b8" />
      ))}
      <path d={avgPath} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinejoin="round" />
      <text x={PAD.l} y={H - 6} fontSize="10" fill="#94a3b8">{formatShort(first)}</text>
      <text x={W - PAD.r} y={H - 6} textAnchor="end" fontSize="10" fill="#94a3b8">
        {formatShort(last)}
      </text>
    </svg>
  );
}
