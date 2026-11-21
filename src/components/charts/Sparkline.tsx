import { useId } from 'react';
import { smooth } from './geometry';

/** Ultra-minimal sparkline — no axes, soft curve */
export function Sparkline({
  values,
  data,
  color = 'var(--color-chart-1)',
  width = 96,
  height = 28,
  rtl = true,
}: {
  values?: number[];
  data?: number[];
  color?: string;
  width?: number;
  height?: number;
  rtl?: boolean;
}) {
  const actualValues = values ?? data ?? [];
  const id = useId().replace(/:/g, '');
  if (!actualValues.length) return null;
  const min = Math.min(...actualValues);
  const max = Math.max(...actualValues);
  const span = max - min || 1;
  const pad = 2;
  const pts = actualValues.map((v, i): [number, number] => {
    const t = actualValues.length > 1 ? i / (actualValues.length - 1) : 0.5;
    return [
      pad + (rtl ? 1 - t : t) * (width - pad * 2),
      pad + (1 - (v - min) / span) * (height - pad * 2),
    ];
  });
  const ordered = [...pts].sort((a, b) => a[0] - b[0]);
  const d = smooth(ordered);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="inline-block align-middle" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity=".28" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d}L${ordered[ordered.length - 1][0]} ${height - pad}L${ordered[0][0]} ${height - pad}Z`} fill={`url(#${id})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}
