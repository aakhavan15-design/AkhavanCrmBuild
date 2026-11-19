import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { ChartCard, type ChartCardProps } from './ChartCard';

export interface EChartCardProps extends Omit<ChartCardProps, 'children'> {
  /** option خام ECharts — از echartsTheme بسازید */
  option: Record<string, unknown>;
  height?: number;
  /** برای sparkline جمع‌وجور */
  sparkline?: boolean;
  onEvents?: Record<string, (params: unknown) => void>;
}

/**
 * پوسته ChartCard + Apache ECharts با تم Neo (Electric Indigo / Neo-Slate)
 */
export function EChartCard({
  option,
  height = 200,
  sparkline = false,
  onEvents,
  empty,
  loading,
  ...cardProps
}: EChartCardProps) {
  const h = sparkline ? Math.min(height, 48) : height;

  const chart = useMemo(() => {
    if (empty || loading) return null;
    return (
      <ReactECharts
        option={option}
        style={{ height: h, width: '100%' }}
        opts={{ renderer: 'svg' }}
        notMerge
        lazyUpdate
        onEvents={onEvents}
      />
    );
  }, [option, h, empty, loading, onEvents]);

  return (
    <ChartCard {...cardProps} empty={empty} loading={loading} height={sparkline ? undefined : h + 56}>
      {chart}
    </ChartCard>
  );
}

export default EChartCard;
