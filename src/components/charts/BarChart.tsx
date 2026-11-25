import { useId, useState } from 'react';
import { lighten } from './geometry';
import { formatNumber } from '../../lib/format';
import { fCompact } from './fmt';

export interface Bar { label: string; value: number }
/** ستونی: میله‌های گرد گرادیانی، شبکه کم‌رنگ و ستون منتخب Indigo. rtl: اولین داده سمت راست. */
export function BarChart({ data, highlight, color = 'var(--color-chart-1)', rtl = true, height = 168 }:
  { data: Bar[]; highlight?: number; color?: string; rtl?: boolean; height?: number }) {
  const id = useId().replace(/:/g, '');
  const [selection,setSelection]=useState<{label:string;index:number}|null>(null);
  const selectedIndex=selection && data[selection.index]?.label===selection.label ? selection.index : null;
  const active=selectedIndex ?? highlight;
  const select=(index:number)=>setSelection(old=>old?.index===index&&old.label===data[index].label?null:{label:data[index].label,index});
  const W = 300, top = 18, base = height - 24, max = Math.max(...data.map(d => d.value), 1);
  const slot = W / Math.max(data.length, 1), bw = Math.min(24, slot * 0.52);
  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="w-full" role="group" aria-label={data.map(d => `${d.label}: ${formatNumber(d.value)}`).join('، ')}>
      <defs>
        <linearGradient id={`${id}n`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" style={{ stopColor: lighten(color, 28) }} /><stop offset="1" style={{ stopColor: color }} /></linearGradient>
        <linearGradient id={`${id}h`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" style={{ stopColor: lighten(color, 18) }} /><stop offset="1" stopColor={color} /></linearGradient>
      </defs>
      {[0, 1, 2, 3].map(i => { const y = top + ((base - top) * i) / 3;
        return <line key={i} x1="0" x2={W} y1={y} y2={y} stroke="var(--color-chart-grid)" strokeOpacity="1" strokeDasharray={i === 3 ? undefined : '2 5'} />; })}
      {data.map((d, k) => {
        const i = rtl ? data.length - 1 - k : k, h = Math.max(0, ((base - top) * d.value) / max), x = i * slot + (slot - bw) / 2, cx = i * slot + slot / 2;
        return (
          <g key={d.label + k} role="button" tabIndex={0} aria-pressed={selectedIndex===k} aria-label={`${d.label}: ${formatNumber(d.value)}`} onClick={()=>select(k)} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();select(k)} if(event.key==='Escape')setSelection(null)}} className="cursor-pointer focus-visible:outline-2 focus-visible:outline-primary">
            <rect x={x} y={base - h} width={bw} height={h} rx={Math.min(5, bw / 3)} fill={`url(#${id}${k === active ? 'h' : 'n'})`} opacity={active===undefined||k===active?1:0.32} className="motion-safe:transition-opacity" />
            <text x={cx} y={height - 7} textAnchor="middle" fontSize="10" fill="var(--color-ink-soft)">{d.label}</text>
            {k === active && <text x={cx} y={base - h - 7} textAnchor="middle" fontSize="10" fontWeight="800" fill="var(--color-ink)">{fCompact(d.value)}</text>}
          </g>);
      })}
    </svg>
  );
}
