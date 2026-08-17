import { WeekPoint } from '../../lib/training/store';

interface Props {
  data: { label: string; value: number }[];
  color?: string;
  height?: number;
  unit?: string;
}

/** minimal dependency-free SVG line/bar chart */
export function LineChart({ data, color = '#c8ff3d', height = 140, unit = '' }: Props) {
  if (data.length === 0) return <div className="text-faint text-xs font-mono py-8 text-center">No data yet</div>;
  const W = 560;
  const H = height;
  const padL = 42;
  const padB = 22;
  const padT = 12;
  const max = Math.max(...data.map((d) => d.value)) * 1.08 || 1;
  const min = Math.min(...data.map((d) => d.value), 0);
  const span = max - min || 1;
  const x = (i: number) => padL + (i / Math.max(1, data.length - 1)) * (W - padL - 10);
  const y = (v: number) => padT + (1 - (v - min) / span) * (H - padT - padB);
  const path = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(' ');
  const area = `${path} L${x(data.length - 1).toFixed(1)},${H - padB} L${x(0).toFixed(1)},${H - padB} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img">
      <defs>
        <linearGradient id="lg-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1={padL} x2={W - 10} y1={padT + f * (H - padT - padB)} y2={padT + f * (H - padT - padB)} stroke="#1d2430" strokeWidth="1" />
      ))}
      <text x={4} y={y(max / 1.08) + 4} fill="#5b6373" fontSize="10" fontFamily="JetBrains Mono, monospace">
        {Math.round(max / 1.08)}
        {unit}
      </text>
      <path d={area} fill="url(#lg-fade)" />
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      {data.map((d, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(d.value)} r="3" fill={color} />
          {data.length <= 12 && (
            <text x={x(i)} y={H - 8} fill="#5b6373" fontSize="8.5" textAnchor="middle" fontFamily="JetBrains Mono, monospace">
              {d.label}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

export function VolumeBars({ data, color = '#60a5fa', height = 140 }: { data: WeekPoint[]; color?: string; height?: number }) {
  if (data.length === 0) return <div className="text-faint text-xs font-mono py-8 text-center">No volume logged yet</div>;
  const W = 560;
  const H = height;
  const padB = 22;
  const padT = 10;
  const max = Math.max(...data.map((d) => d.volume)) || 1;
  const bw = (W - 20) / data.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img">
      {data.map((d, i) => {
        const h = (d.volume / max) * (H - padB - padT);
        return (
          <g key={d.week}>
            <rect x={10 + i * bw + bw * 0.15} y={H - padB - h} width={bw * 0.7} height={h} rx="3" fill={color} opacity="0.85" />
            {data.length <= 14 && (
              <text x={10 + i * bw + bw / 2} y={H - 8} fill="#5b6373" fontSize="8" textAnchor="middle" fontFamily="JetBrains Mono, monospace">
                {d.week.slice(5)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
