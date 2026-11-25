import { useId, useState, type CSSProperties } from 'react';
import { arc, lighten } from './geometry';
import { fNum, fPct, Segment } from './fmt';
import { useCountUp } from '../../hooks/useCountUp';

/** دونات لوکس: گرادیان هر بخش، سایه رنگی نرم، قرص مرکزی شیشه‌ای، حباب عددی (مطابق مرجع). */
export function DonutChart({ segments, centerValue, centerLabel, size = 168, thickness = 18, showLegend = true, activeSegment, onSegmentClick, formatValue = fNum, compact = false }:
  { segments: Segment[]; centerValue?: string | number; centerLabel?: string; size?: number; thickness?: number; showLegend?: boolean; activeSegment?: string | null; onSegmentClick?: (segment: Segment) => void; formatValue?: (value: number) => string; compact?: boolean }) {
  const uid = useId().replace(/:/g, '');
  const [hot, setHot] = useState<number | null>(null);
  const animatedCenterValue = useCountUp(typeof centerValue === 'number' ? centerValue : 0, 850);
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = 60 - thickness / 2;
  let a = 0;
  const visible = segments.filter(s => s.value > 0);
  const hovered = hot === null ? (compact ? segments.find(segment=>segment.label===activeSegment) ?? null : null) : segments[hot];
  const centerText = String(hovered ? formatValue(hovered.value) : typeof centerValue === 'number' ? formatValue(Math.round(animatedCenterValue)) : (centerValue ?? formatValue(total)));
  return (
    <div className={compact?"flex min-w-0 flex-col items-center gap-2":"flex flex-wrap items-center justify-center gap-6"}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg viewBox="0 0 120 120" width={size} height={size} role="img" className="se-donut" data-active={hot !== null ? 'true' : 'false'} style={{ '--th': thickness } as CSSProperties} onMouseLeave={() => setHot(null)}
             aria-label={segments.map(s => `${s.label}: ${formatValue(s.value)}`).join('، ')}>
          <defs>
            {segments.map((s, i) => (
              <linearGradient key={i} id={`${uid}g${i}`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" style={{ stopColor: lighten(s.color, 30) }} /><stop offset="1" style={{ stopColor: s.color }} />
              </linearGradient>))}
          </defs>
          <circle cx="60" cy="60" r={r} fill="none" stroke="var(--color-chart-grid)" strokeOpacity="1" strokeWidth={thickness} />
          {total > 0 && segments.map((s, i) => {
            if (s.value <= 0) return null;
            const span = (s.value / total) * 360;
            const gap = visible.length > 1 ? Math.min(3, span / 4) : 0;
            const d = arc(60, 60, r, a + gap / 2, a + span - gap / 2); a += span;
            return <path key={i} d={d} fill="none" stroke={`url(#${uid}g${i})`} strokeWidth={thickness}
                         strokeLinecap={visible.length > 1 ? 'round' : 'butt'} data-on={hot === i || activeSegment === s.label ? 'true' : 'false'} tabIndex={onSegmentClick ? 0 : -1} role={onSegmentClick ? 'button' : undefined} aria-pressed={onSegmentClick ? activeSegment === s.label : undefined} aria-label={`${s.label}: ${formatValue(s.value)}${onSegmentClick ? '، برای فیلتر انتخاب کنید' : ''}`}
                         onMouseEnter={() => setHot(i)} onFocus={() => setHot(i)} onBlur={() => setHot(null)} onTouchStart={() => setHot(i)} onClick={() => onSegmentClick?.(s)} onKeyDown={e => { if (onSegmentClick && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onSegmentClick(s); } }} style={{ opacity: (hot === null && !activeSegment) || hot === i || activeSegment === s.label ? 1 : .38, cursor: onSegmentClick ? 'pointer' : 'default', transition: 'opacity 300ms ease, stroke-width 300ms ease' }} />;
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="grid place-items-center rounded-full bg-card text-center ring-1 ring-border/40"
               style={{ width: size * 0.56, height: size * 0.56 }}>
            <div className="min-w-0 max-w-full wrap-break-word px-1">
              <div className={`max-w-full px-1 font-extrabold leading-none tabular-nums text-ink ${centerText.length <= 6 ? 'text-kpi' : centerText.length <= 9 ? 'text-h2' : 'text-compact'}`}>{centerText}</div>
              {(hovered || centerLabel) && <div className="mt-1 text-micro font-medium text-ink-soft">{hovered ? hovered.label : centerLabel}</div>}
            </div>
          </div>
        </div>
      </div>
      {showLegend && (
        <ul className={compact?"grid w-full min-w-0 gap-1 text-micro text-ink":"grid min-w-(--size-150) gap-2.5 text-xs font-bold text-ink"}>
          {segments.map(s => (
            <li key={s.label} className={`${compact ? "flex flex-wrap items-center gap-1" : "flex items-center gap-2.5"} rounded-lg transition-colors ${activeSegment === s.label ? 'bg-primary/8 ring-1 ring-primary/20 px-2 py-1' : ''}`}>
              <i className="h-3 w-3 shrink-0 rounded-full shadow-sm" style={{ background: `linear-gradient(135deg, ${lighten(s.color, 30)}, ${s.color})` }} />
              <span className={compact?"min-w-0 flex-1 break-words":undefined}>{s.label}</span>
              <span className={compact?"ms-auto max-w-full break-words tabular-nums font-medium text-ink-soft":"ms-auto ps-3 font-mono font-medium text-ink-soft"}>{formatValue(s.value)} · {total ? fPct((s.value / total) * 100) : fPct(0)}</span>
            </li>))}
        </ul>
      )}
    </div>
  );
}
