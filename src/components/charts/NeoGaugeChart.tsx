import React, { useMemo } from 'react';
import { gaugeOption } from './echartsTheme';
import { EChartCard } from './EChartCard';

export function NeoGaugeChart({
  title,
  periodLabel,
  value,
  max = 100,
  gaugeTitle = '',
  height = 180,
  onClick,
  empty,
}: {
  title: string;
  periodLabel?: string;
  value: number;
  max?: number;
  gaugeTitle?: string;
  height?: number;
  onClick?: () => void;
  empty?: boolean;
}) {
  const option = useMemo(() => gaugeOption(value, max, gaugeTitle), [value, max, gaugeTitle]);
  return (
    <EChartCard
      title={title}
      periodLabel={periodLabel}
      option={option}
      height={height}
      onClick={onClick}
      empty={empty}
      emptyMessage="برای این بازه دادهٔ ثبت‌شده‌ای نیست"
    />
  );
}
