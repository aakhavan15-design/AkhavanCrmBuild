import React, { useMemo } from 'react';
import { lineChartOption } from './echartsTheme';
import { EChartCard } from './EChartCard';

export function NeoLineChart({
  title,
  periodLabel,
  labels,
  values,
  seriesName = 'مقدار',
  height = 200,
  onClick,
  empty,
}: {
  title: string;
  periodLabel?: string;
  labels: string[];
  values: number[];
  seriesName?: string;
  height?: number;
  onClick?: () => void;
  empty?: boolean;
}) {
  const hasData = values.some((v) => v != null && Number(v) !== 0);
  const option = useMemo(
    () => lineChartOption(labels, values, seriesName),
    [labels, values, seriesName]
  );
  return (
    <EChartCard
      title={title}
      periodLabel={periodLabel}
      option={option}
      height={height}
      onClick={onClick}
      empty={empty || !hasData}
      emptyMessage="برای این بازه دادهٔ ثبت‌شده‌ای نیست"
    />
  );
}
