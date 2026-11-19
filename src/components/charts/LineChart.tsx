import { useId, useState } from 'react';
import { smooth } from './geometry';

/** 2026 clean chart: soft curve, optional grid, floating tooltip on hover/touch */
export function LineChart({
  values,
  labels,
  color = 'var(--color-chart-1)',
  rtl = true,
  height = 148,
  clean = true,
  showGrid = false,
}: {
  values: number[];
  labels?: string[];
  color?: string;
  rtl?: boolean;
  height?: number;
  clean?: boolean;
  showGrid?: boolean;
}) {
  const id = useId().replace(/:/g, '');
  const [hover, setHover] = useState<number | null>(null);
  if (values.length === 0) return null;

  const W = 300;
  const top = 16;
  const base = height - (labels && !clean ? 24 : 10);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i): [number, number] => {
    const t = values.length > 1 ? i / (values.length - 1) : 0.5;
    return [
      10 + (rtl ? 1 - t : t) * (W - 20),
      values.length === 1 ? (top + base) / 2 : base - ((v - min) / span) * (base - top),
    ];
  });
  const ordered = [...pts].sort((a, b) => a[0] - b[0]);
  const line = smooth(ordered);
  const last = pts[pts.length - 1];
  const active = hover ?? values.length - 1;
  const tip = pts[active];

  const delta =
    values.length > 1
      ? ((values[values.length - 1] - values[0]) / (Math.abs(values[0]) || 1)) * 100
      : 0;
  const deltaLabel =
    values.length > 1
      ? `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}٪ نسبت به ابتدای بازه`
      : '';

  const onMove = (clientX: number, rect: DOMRect) => {
    const x = ((clientX - rect.left) / rect.width) * W;
    let best = 0;
    let bestD = Infinity;
    pts.forEach((p, i) => {
      const d = Math.abs(p[0] - x);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    setHover(best);
  };

  return (
    <div className="relative w-full se-spring" dir="ltr">
      <svg
        viewBox={`0 0 ${W} ${height}`}
        className="w-full cursor-crosshair"
        role="img"
        aria-label={`روند: از ${values[0]} تا ${values[values.length - 1]}`}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => onMove(e.clientX, e.currentTarget.getBoundingClientRect())}
        onTouchStart={(e) => {
          const t = e.touches[0];
          if (t) onMove(t.clientX, e.currentTarget.getBoundingClientRect());
        }}
        onTouchMove={(e) => {
          const t = e.touches[0];
          if (t) onMove(t.clientX, e.currentTarget.getBoundingClientRect());
        }}
      >
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity=".38" />
            <stop offset="0.55" stopColor={color} stopOpacity=".12" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`${id}-stroke`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={color} stopOpacity=".75" />
            <stop offset="1" stopColor={color} stopOpacity="1" />
          </linearGradient>
        </defs>
        {(showGrid || !clean) &&
          [0, 1, 2].map((i) => (
            <line
              key={i}
              x1="0"
              x2={W}
              y1={top + ((base - top) * i) / 2}
              y2={top + ((base - top) * i) / 2}
              stroke="var(--color-chart-grid)"
              strokeOpacity={clean ? 0.35 : 1}
              strokeDasharray={i === 2 ? undefined : '2 5'}
            />
          ))}
        <path
          d={`${line}L${ordered[ordered.length - 1][0]} ${base}L${ordered[0][0]} ${base}Z`}
          fill={`url(#${id})`}
        />
        <path
          d={line}
          fill="none"
          stroke={`url(#${id}-stroke)`}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle
          cx={last[0]}
          cy={last[1]}
          r="4.5"
          fill={color}
          stroke="var(--color-card)"
          strokeWidth="2.5"
        />
        {hover != null && tip && (
          <>
            <line
              x1={tip[0]}
              x2={tip[0]}
              y1={top}
              y2={base}
              stroke={color}
              strokeOpacity="0.25"
              strokeDasharray="3 4"
            />
            <circle cx={tip[0]} cy={tip[1]} r="5" fill={color} stroke="var(--color-card)" strokeWidth="2" />
          </>
        )}
        {!clean &&
          labels?.map((l, i) => (
            <text key={l + i} x={pts[i][0]} y={height - 7} textAnchor="middle" fontSize="10" fill="var(--color-ink-soft)">
              {l}
            </text>
          ))}
      </svg>
      {hover != null && tip && (
        <div
          className="pointer-events-none absolute z-10 rounded-xl border border-border/60 bg-surface/95 px-2.5 py-1.5 text-caption font-bold text-text-main shadow-lg backdrop-blur-md"
          style={{
            left: `${(tip[0] / W) * 100}%`,
            top: Math.max(4, tip[1] - 36),
            transform: 'translateX(-50%)',
          }}
          role="status"
        >
          <div>{values[active].toLocaleString('fa-IR')}</div>
          {labels?.[active] && <div className="text-micro font-medium text-text-secondary">{labels[active]}</div>}
          {hover === values.length - 1 && deltaLabel && (
            <div className="text-micro font-medium text-primary mt-0.5">{deltaLabel}</div>
          )}
        </div>
      )}
    </div>
  );
}
