import React, { useMemo } from 'react';
import { donutOption } from './echartsTheme';
import { EChartCard } from './EChartCard';

export function NeoDonutChart({
  title,
  periodLabel,
  segments,
  centerLabel,
  height = 220,
  onClick,
  empty,
}: {
  title: string;
  periodLabel?: string;
  segments: { name: string; value: number }[];
  centerLabel?: string;
  height?: number;
  onClick?: () => void;
  empty?: boolean;
}) {
  const hasData = segments.some((s) => s.value > 0);
  const option = useMemo(
    () => donutOption(segments, centerLabel),
    [segments, centerLabel]
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
