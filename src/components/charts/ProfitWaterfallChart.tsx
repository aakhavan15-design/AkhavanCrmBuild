import React from 'react';
import { formatCurrency } from '../../lib/utils';

export interface WaterfallStep {
  label: string;
  amount: number;
  type: 'POSITIVE' | 'NEGATIVE' | 'SUBTOTAL';
}

interface ProfitWaterfallChartProps {
  steps: WaterfallStep[];
  height?: number;
}

export function ProfitWaterfallChart({ steps, height = 180 }: ProfitWaterfallChartProps) {
  if (!steps || steps.length === 0) return null;

  const maxVal = Math.max(...steps.map(s => Math.abs(s.amount)), 1);

  return (
    <div className="w-full space-y-2" dir="rtl">
      <div className="space-y-1.5">
        {steps.map((step, idx) => {
          const widthPct = Math.min(100, Math.max(8, (Math.abs(step.amount) / maxVal) * 100));
          const isNegative = step.type === 'NEGATIVE';
          const isSubtotal = step.type === 'SUBTOTAL';

          return (
            <div key={idx} className="flex items-center justify-between text-xs gap-3">
              <span className="w-28 sm:w-36 truncate text-text-secondary font-medium">
                {step.label}
              </span>
              <div className="flex-1 flex items-center gap-2">
                <div className="w-full bg-border/40 h-3 rounded-full overflow-hidden flex">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      isSubtotal ? 'bg-primary' : isNegative ? 'bg-danger' : 'bg-success'
                    }`}
                    style={{ width: `${widthPct}%` }}
                  />
                </div>
                <span className={`w-28 text-left font-mono font-bold shrink-0 tabular-nums ${
                  isSubtotal ? 'text-primary' : isNegative ? 'text-danger' : 'text-success'
                }`}>
                  {isNegative ? '-' : '+'}{formatCurrency(Math.abs(step.amount))}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
