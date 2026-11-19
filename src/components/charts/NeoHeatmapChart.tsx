import React, { useMemo } from 'react';
import { heatmapOption } from './echartsTheme';
import { EChartCard } from './EChartCard';

export function NeoHeatmapChart({
  title,
  periodLabel,
  xLabels,
  yLabels,
  cells,
  seriesName = 'شدت',
  height = 240,
  onClick,
  empty,
}: {
  title: string;
  periodLabel?: string;
  xLabels: string[];
  yLabels: string[];
  cells: [number, number, number][];
  seriesName?: string;
  height?: number;
  onClick?: () => void;
  empty?: boolean;
}) {
  const hasData = cells.some((c) => c[2] > 0);
  const option = useMemo(
    () => heatmapOption(xLabels, yLabels, cells, seriesName),
    [xLabels, yLabels, cells, seriesName]
  );
  return (
    <EChartCard
      title={title}
      periodLabel={periodLabel}
      option={option}
      height={height}
      onClick={onClick}
      empty={empty || !hasData}
      emptyMessage="برای این بازه دادهٔ مکانی/زمانی ثبت‌شده‌ای نیست"
    />
  );
}

export default NeoHeatmapChart;
