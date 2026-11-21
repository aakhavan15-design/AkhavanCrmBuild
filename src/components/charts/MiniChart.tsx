import { useId } from 'react';
import { useReducedMotion } from 'motion/react';
import { formatNumber } from '../../lib/format';
import { AreaChart, Area, ResponsiveContainer, Tooltip } from 'recharts';

interface MiniChartProps {
  data: number[] | { value: number }[];
  color?: string;
  height?: number;
  isPositive?: boolean;
  showTooltip?: boolean;
}

export function MiniChart({
  data,
  color,
  height = 28,
  isPositive = true,
  showTooltip = false,
}: MiniChartProps) {
  const gradientId = useId().replace(/:/g, '');
  const reducedMotion = useReducedMotion();
  if (!data || data.length === 0) return null;

  const chartData = data.map((d, index) => ({
    index,
    value: typeof d === 'number' ? d : d.value,
  }));

  const strokeColor = color || (isPositive ? 'var(--c-success)' : 'var(--c-danger)');

  return (
    <div className="w-full select-none" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={strokeColor} stopOpacity={0.35} />
              <stop offset="100%" stopColor={strokeColor} stopOpacity={0.0} />
            </linearGradient>
          </defs>

          {showTooltip && (
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  return (
                    <div className="rounded-lg border border-border/60 bg-surface/95 px-2 py-0.5 text-micro font-bold text-text-main shadow-md backdrop-blur-xs">
                      {formatNumber(Number(payload[0].value))}
                    </div>
                  );
                }
                return null;
              }}
            />
          )}

          <Area
            type="monotone"
            dataKey="value"
            stroke={strokeColor}
            strokeWidth={1.75}
            fill={`url(#${gradientId})`}
            isAnimationActive={!reducedMotion}
            animationDuration={350}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
