import { formatMoney, formatMoneyCompact, formatNumber } from '../../lib/format';

/**
 * تم Neo برای Apache ECharts — هویت: Neo-Slate + Electric Indigo
 * رنگ‌ها از توکن‌های CSS خوانده می‌شوند تا Light/Dark درست بماند.
 */

function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/** پالت Neo برای سری‌های نمودار */
export function neoChartColors(): string[] {
  return [
    cssVar('--c-cobalt', 'currentColor'),
    cssVar('--c-forest', 'currentColor'),
    cssVar('--c-copper', 'currentColor'),
    cssVar('--c-burgundy', 'currentColor'),
    cssVar('--c-navy-light', 'currentColor'),
    cssVar('--chart-6', 'currentColor'),
    cssVar('--chart-2', 'currentColor'),
    cssVar('--chart-7', 'currentColor'),
  ];
}

export function neoBaseOption(): Record<string, unknown> {
  const ink = cssVar('--c-ink-main', 'currentColor');
  const muted = cssVar('--c-ink-muted', 'currentColor');
  const faint = cssVar('--c-ink-faint', 'currentColor');
  const border = cssVar('--c-border', 'currentColor');
  const surface = cssVar('--c-surface', 'currentColor');
  const primary = cssVar('--c-cobalt', 'currentColor');

  return {
    color: neoChartColors(),
    textStyle: {
      fontFamily: 'inherit',
      color: ink,
    },
    grid: {
      left: 8,
      right: 8,
      top: 24,
      bottom: 28,
      containLabel: true,
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: surface,
      borderColor: border,
      borderWidth: 1,
      textStyle: { color: ink, fontSize: 12 },
      // اعداد فارسی در formatter بیرونی اعمال می‌شود
    },
    categoryAxis: {
      axisLine: { lineStyle: { color: border } },
      axisTick: { show: false },
      axisLabel: { color: muted, fontSize: 10 },
      splitLine: { show: false },
    },
    valueAxis: {
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: faint, fontSize: 10 },
      splitLine: {
        lineStyle: { color: border, type: 'dashed', opacity: 0.8 },
      },
    },
    // برای sparkline
    animationDuration: 400,
    animationEasing: 'cubicOut',
    primary,
  };
}

/** Sparkline Line — بدون محور و tooltip شلوغ */
export function sparkLineOption(values: number[], color?: string): Record<string, unknown> {
  const c = color || cssVar('--c-cobalt', 'currentColor');
  return {
    ...neoBaseOption(),
    grid: { left: 0, right: 0, top: 4, bottom: 4 },
    xAxis: { type: 'category', show: false, data: values.map((_, i) => i) },
    yAxis: { type: 'value', show: false, min: 'dataMin', max: 'dataMax' },
    tooltip: { show: false },
    series: [
      {
        type: 'line',
        data: values,
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 1.75, color: c },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: c + '55' },
              { offset: 1, color: c + '00' },
            ],
          },
        },
      },
    ],
  };
}

export function ledgerTrendOption(labels: string[], series: readonly {
  name: string; values: (number | null)[]; colorToken: string;
}[]): Record<string, unknown> {
  const base = lineChartOption(labels, []);
  const ink = cssVar('--c-ink-main', 'currentColor');
  return {
    ...base,
    grid: { left: 10, right: 10, top: 36, bottom: 26, containLabel: true },
    tooltip: {
      ...(base.tooltip as object), renderMode: 'richText',
      valueFormatter: (value: number | null) => formatMoney(value),
    },
    legend: { type: 'scroll', top: 4, textStyle: { color: ink } },
    yAxis: {
      ...(base.yAxis as { axisLabel?: object }),
      axisLabel: { ...(base.yAxis as { axisLabel?: object }).axisLabel,
        formatter: (value: number) => formatMoneyCompact(value, '') },
    },
    series: series.map(item => {
      const color = cssVar(item.colorToken, 'currentColor');
      return { name: item.name, type: 'line', data: item.values, connectNulls: false,
        smooth: true, symbol: 'circle', symbolSize: 5, lineStyle: { width: 2, color }, itemStyle: { color } };
    }),
  };
}

export function lineChartOption(
  labels: string[],
  values: number[],
  seriesName = 'مقدار'
): Record<string, unknown> {
  const base = neoBaseOption();
  const primary = (base as { primary?: string }).primary || cssVar('--c-cobalt', 'currentColor');
  return {
    ...base,
    tooltip: {
      ...(base.tooltip as object),
      valueFormatter: (v: number) =>
        typeof v === 'number' ? formatNumber(v) : String(v ?? ''),
    },
    xAxis: {
      type: 'category',
      data: labels,
      axisLabel: { color: cssVar('--c-ink-muted', 'currentColor'), fontSize: 10 },
      axisLine: { lineStyle: { color: cssVar('--c-border', 'currentColor') } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        color: cssVar('--c-ink-faint', 'currentColor'),
        fontSize: 10,
        formatter: (v: number) => formatNumber(v),
      },
      splitLine: {
        lineStyle: { color: cssVar('--c-border', 'currentColor'), type: 'dashed' },
      },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [
      {
        name: seriesName,
        type: 'line',
        data: values,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { width: 2.5, color: primary },
        itemStyle: { color: primary },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: primary + '40' },
              { offset: 1, color: primary + '00' },
            ],
          },
        },
      },
    ],
  };
}

export function donutOption(
  segments: { name: string; value: number }[],
  centerLabel?: string
): Record<string, unknown> {
  const base = neoBaseOption();
  return {
    ...base,
    tooltip: {
      trigger: 'item',
      backgroundColor: cssVar('--c-surface', 'currentColor'),
      borderColor: cssVar('--c-border', 'currentColor'),
      textStyle: { color: cssVar('--c-ink-main', 'currentColor'), fontSize: 12 },
      valueFormatter: (v: number) => v.toLocaleString('fa-IR'),
    },
    legend: {
      bottom: 0,
      textStyle: { color: cssVar('--c-ink-secondary', 'currentColor'), fontSize: 11 },
    },
    series: [
      {
        type: 'pie',
        radius: ['58%', '78%'],
        center: ['50%', '46%'],
        avoidLabelOverlap: true,
        label: {
          show: !!centerLabel,
          position: 'center',
          formatter: centerLabel || '',
          fontSize: 14,
          fontWeight: 700,
          color: cssVar('--c-ink-main', 'currentColor'),
        },
        data: segments.map((s) => ({ name: s.name, value: s.value })),
      },
    ],
  };
}

export function gaugeOption(value: number, max = 100, title = ''): Record<string, unknown> {
  const primary = cssVar('--c-cobalt', 'currentColor');
  const success = cssVar('--c-forest', 'currentColor');
  const warn = cssVar('--c-copper', 'currentColor');
  const danger = cssVar('--c-burgundy', 'currentColor');
  const muted = cssVar('--c-ink-muted', 'currentColor');
  const ink = cssVar('--c-ink-main', 'currentColor');

  return {
    series: [
      {
        type: 'gauge',
        startAngle: 200,
        endAngle: -20,
        min: 0,
        max,
        radius: '100%',
        progress: { show: true, width: 12 },
        axisLine: {
          lineStyle: {
            width: 12,
            color: [
              [0.4, danger],
              [0.7, warn],
              [1, success],
            ],
          },
        },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        pointer: { length: '55%', width: 4, itemStyle: { color: primary } },
        anchor: { show: true, size: 8, itemStyle: { color: primary } },
        detail: {
          valueAnimation: true,
          fontSize: 22,
          fontWeight: 700,
          color: ink,
          offsetCenter: [0, '70%'],
          formatter: (v: number) => `${Number(v).toLocaleString('fa-IR')}٪`,
        },
        title: {
          show: !!title,
          offsetCenter: [0, '92%'],
          color: muted,
          fontSize: 11,
        },
        data: [{ value, name: title }],
      },
    ],
  };
}

/** Heatmap تقویمی / ماتریسی — روز × متریک (مثلاً فروشنده یا منطقه) */
export function heatmapOption(
  xLabels: string[],
  yLabels: string[],
  cells: [number, number, number][], // [xIndex, yIndex, value]
  seriesName = 'شدت'
): Record<string, unknown> {
  const primary = cssVar('--c-cobalt', 'currentColor');
  const ink = cssVar('--c-ink-main', 'currentColor');
  const muted = cssVar('--c-ink-muted', 'currentColor');
  const border = cssVar('--c-border', 'currentColor');
  const surface = cssVar('--c-surface', 'currentColor');
  const maxVal = Math.max(...cells.map((c) => c[2]), 1);

  return {
    ...neoBaseOption(),
    tooltip: {
      position: 'top',
      backgroundColor: surface,
      borderColor: border,
      textStyle: { color: ink, fontSize: 12 },
      formatter: (p: { name?: string; value?: number[] | number; seriesName?: string }) => {
        const v = Array.isArray(p.value) ? p.value[2] : p.value;
        const n = typeof v === 'number' ? v.toLocaleString('fa-IR') : '—';
        return `${p.name || seriesName}: ${n}`;
      },
    },
    grid: { left: 48, right: 12, top: 16, bottom: 40, containLabel: false },
    xAxis: {
      type: 'category',
      data: xLabels,
      splitArea: { show: true },
      axisLabel: { color: muted, fontSize: 10 },
      axisTick: { show: false },
      axisLine: { show: false },
    },
    yAxis: {
      type: 'category',
      data: yLabels,
      splitArea: { show: true },
      axisLabel: { color: muted, fontSize: 10 },
      axisTick: { show: false },
      axisLine: { show: false },
    },
    visualMap: {
      min: 0,
      max: maxVal,
      calculable: false,
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
      itemWidth: 12,
      itemHeight: 80,
      textStyle: { color: muted, fontSize: 10 },
      inRange: {
        color: [cssVar('--c-primary-soft', 'currentColor'), cssVar('--c-bottom-nav-active', 'currentColor'), primary, cssVar('--c-navy-dark', 'currentColor')],
      },
    },
    series: [
      {
        name: seriesName,
        type: 'heatmap',
        data: cells,
        label: { show: false },
        emphasis: {
          itemStyle: { shadowBlur: 8, shadowColor: cssVar('--c-chart-shadow', 'currentColor') },
        },
      },
    ],
  };
}

/** Accounting waterfall with crossing-zero movements and explicit total bars. */
export function financialWaterfallOption(steps: { label: string; amount: number; total?: boolean }[]): Record<string, unknown> {
  const base = neoBaseOption();
  let balance = 0;
  const bars = steps.map((step, index) => {
    const from = step.total ? 0 : balance;
    const to = step.total ? step.amount : from + step.amount;
    balance = to;
    return [index, from, to, step.amount, step.total ? 1 : 0];
  });
  const colors = [cssVar('--c-danger', 'currentColor'), cssVar('--c-success', 'currentColor'), cssVar('--c-cobalt', 'currentColor')];
  return {
    ...base,
    tooltip: { ...(base.tooltip as object), trigger: 'item', renderMode: 'richText',
      formatter: (params: { data: number[] }) => `${steps[params.data[0]].label}\n${formatMoney(params.data[3])}` },
    xAxis: { ...(base.categoryAxis as object), type: 'category', inverse: true, data: steps.map(step => step.label),
      axisLabel: { ...(base.categoryAxis as { axisLabel?: object }).axisLabel, interval: 0, width: 62, overflow: 'truncate' } },
    yAxis: { ...(base.valueAxis as object), type: 'value',
      axisLabel: { ...(base.valueAxis as { axisLabel?: object }).axisLabel,
        formatter: (value: number) => formatMoneyCompact(value, '') } },
    dataZoom: [{ type: 'inside', zoomOnMouseWheel: 'ctrl', moveOnMouseWheel: false, endValue: 6 }],
    series: [{
      type: 'custom',
      encode: { x: 0, y: [1, 2] },
      data: bars,
      renderItem: (_: unknown, api: { value: (index: number) => number; coord: (point: number[]) => number[]; size: (range: number[]) => number[] }) => {
        const [x, from] = api.coord([api.value(0), api.value(1)]);
        const [, to] = api.coord([api.value(0), api.value(2)]);
        const width = Math.min(36, Math.abs(api.size([1, 0])[0]) * 0.55);
        return {
          type: 'rect',
          shape: { x: x - width / 2, y: Math.min(from, to), width, height: Math.max(1, Math.abs(to - from)) },
          style: { fill: colors[api.value(4) ? 2 : api.value(3) < 0 ? 0 : 1] },
        };
      },
    }],
  };
}
