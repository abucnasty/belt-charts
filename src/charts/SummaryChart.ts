import { AggregationStrategy } from "../data/AggregationStrategy"
import { MetricName } from "../data/Metric"
import { MetricEnum } from "../data/MetricEnum"
import { MetricProfiles, MetricRegistryInstance, toMetricRecord } from "../data/MetricRegistry"
import { formatSlowdown } from "../utils"
import { colors, chartLayout } from "./constants"
import type { ChartConfiguration } from "chart.js";
import { BenchmarkAggregateRunResult } from "../data/BenchmarkAggregateResult"
import { buildSummaryChartData } from "../data/SummaryTransform"
import fsp from "node:fs/promises";
import { getMetricPattern } from "./styles"
import { backgroundPlugin } from "./plugins"
import { createTableChartPlugin, estimateTableWidth, estimateTextWidth, tableReservedHeight } from "./Table"

const supportedMetrics = toMetricRecord(MetricProfiles.SUMMARY_CHART);

interface SummaryChartOptions {
  aggregationStrategy: AggregationStrategy;
  metrics?: MetricEnum[];
  includeTable?: boolean;
  csvTableExportName?: string;
  titleOverride?: string;
  sortBy?: "total" | "preserve";
  isPerRun?: boolean;
  /** Hide metrics whose max average across all results is below this % of wholeUpdate. 0 = no filter. */
  minPercent?: number;
  /** Override the maximum x-axis value (microseconds). */
  maxUpdate?: number | null;
  /** Group keys for clustering bars. Each result is assigned to the longest matching key. Unmatched results are excluded. */
  groupBy?: string[];
  /** When true, skip the MetricProfiles.SUMMARY_CHART filter and render any metric in `metrics`. */
  allowUnfilteredMetrics?: boolean;
  /** "ups" renders a single bar of 1e6/wholeUpdate (updates per second) instead of the stacked per-component time breakdown. */
  valueMode?: "time" | "ups";
}

export interface SummaryChartResult {
  config: ChartConfiguration<"bar">;
  exportTable: (() => Promise<void>) | null;
  /** Minimum canvas height (px) needed to fit every row/table without squishing; use as a floor over the user-requested height. */
  recommendedHeight: number;
  /** Minimum canvas width (px) needed to fit the summary table's columns without squishing; use as a floor over the user-requested width. */
  recommendedWidth: number;
}

export const createSummaryChartConfiguration = (results: BenchmarkAggregateRunResult[], options: SummaryChartOptions): SummaryChartResult => {


  let configuredDisplayMetrics: Partial<Record<MetricName, MetricEnum>> = {}
  if (options.metrics) {
    const source = options.allowUnfilteredMetrics
      ? options.metrics
      : options.metrics.filter(it => supportedMetrics[it.name] != undefined);
    source.forEach(metric => configuredDisplayMetrics[metric.name] = metric)
  } else {
    configuredDisplayMetrics = { ...supportedMetrics }
  }

  let chartData = results.map(result => buildSummaryChartData(result, configuredDisplayMetrics, options.aggregationStrategy));
  // Sort data by "Whole Update" total time ascending (unless sortBy is "preserve")
  if (options.sortBy !== "preserve") {
    chartData.sort((a, b) => a.totalAverage - b.totalAverage);
  }

  const groupBy = options.groupBy ?? [];
  const getGroup = (data: { group?: string }): string | null => data.group ?? null;

  if (groupBy.length > 0) {
    // Filter to only results that match a group key, then sort by group order (index in groupBy list).
    chartData = chartData.filter(d => getGroup(d) !== null);
    chartData.sort((a, b) => {
      const ai = groupBy.indexOf(getGroup(a)!);
      const bi = groupBy.indexOf(getGroup(b)!);
      if (ai !== bi) return ai - bi;
      return a.totalAverage - b.totalAverage;
    });
  }

  const allMetrics = Array.from(new Set(chartData.flatMap(it => it.metrics.map(metric => metric.name)))).map(metricName => MetricRegistryInstance.getOrThrow(metricName))

  // When the only requested metric is wholeUpdate, render it as a single white bar with no "Other".
  const isWholeUpdateOnly =
    !!options.metrics?.length &&
    options.metrics.every(m => m.name === MetricEnum.WHOLE_UPDATE.name);

  const valueMode = options.valueMode ?? "time";
  // UPS is always rendered as a single bar since a rate can't be stacked into components.
  const isSingleBar = isWholeUpdateOnly || valueMode === "ups";
  const toDisplayValue = (microseconds: number): number =>
    valueMode === "ups" ? (microseconds > 0 ? 1_000_000 / microseconds : 0) : microseconds;

  // Apply minPercent filter: hide metrics whose max average never exceeds minPercent% of wholeUpdate.
  const minPercent = options.minPercent ?? 0;
  const metrics = isSingleBar
    ? [MetricEnum.WHOLE_UPDATE]
    : minPercent > 0
      ? allMetrics.filter(metric => {
          if (metric.name === MetricEnum.WHOLE_UPDATE.name) return true;
          const maxAvg = Math.max(...chartData.map(d => d.metricValues.find(mv => mv.metricName === metric.name)?.average ?? 0));
          const maxTotal = Math.max(...chartData.map(d => d.totalAverage));
          return maxTotal > 0 && (maxAvg / maxTotal) * 100 >= minPercent;
        })
      : allMetrics;

  // Build interleaved row structure: group header spacers + data rows.
  // The zero-width-space prefix marks spacer entries; used in tick styling below.
  const SPACER_PREFIX = "\u200B";
  type ChartRow = { kind: "data"; idx: number } | { kind: "spacer"; groupLabel: string };
  const rows: ChartRow[] = [];
  if (groupBy.length > 0) {
    let lastGroup: string | null = null;
    chartData.forEach((data, idx) => {
      const group = getGroup(data)!;
      if (group !== lastGroup) {
        rows.push({ kind: "spacer", groupLabel: group });
        lastGroup = group;
      }
      rows.push({ kind: "data", idx });
    });
  } else {
    chartData.forEach((_, idx) => rows.push({ kind: "data", idx }));
  }
  const chartLabels = rows.map(row =>
    row.kind === "spacer" ? SPACER_PREFIX + row.groupLabel : chartData[row.idx].displayName
  );

  const datasets = isSingleBar
    ? [{
        label: valueMode === "ups" ? "Updates Per Second" : MetricEnum.WHOLE_UPDATE.description,
        data: rows.map(row => row.kind === "spacer" ? null : toDisplayValue(chartData[row.idx].totalAverage)),
        // UPS reuses the entityUpdate blue since it isn't part of the stacked time breakdown.
        backgroundColor: valueMode === "ups" ? colors.blue : colors.white,
      }]
    : metrics
        .filter(metric => metric.name != MetricEnum.WHOLE_UPDATE.name) // Exclude wholeUpdate from stacked bars
        .map(metric => ({
          label: metric.description,
          data: rows.map(row => row.kind === "spacer" ? null : (chartData[row.idx].metricValues.find(it => it.metricName === metric.name)?.average || 0)),
          backgroundColor: getMetricPattern(metric.name),
        }))

  // Compute shared statistics for both plugins
  const computeTableStats = () => {
    // UPS shows a raw +/- delta instead of a slowdown percent, since "slower" reads oddly for
    // a rate that can also increase.
    const useSignedDelta = valueMode === "ups";
    const header = [
      ...(groupBy.length > 0 ? ["Group"] : []),
      "Save File",
      ...metrics.map(it => it.name === MetricEnum.WHOLE_UPDATE.name && valueMode === "ups" ? "UPS" : it.description),
      useSignedDelta ? "+/- vs Previous" : "vs Prev",
      useSignedDelta ? "+/- vs Best" : "vs Best"
    ];

    // Pre-compute whole update values and stats
    const wholeUpdateStats = chartData.map((data, idx) => {

      const currentValue = toDisplayValue(data.totalAverage);
      const previousValue = idx > 0 ? toDisplayValue(chartData[idx - 1].totalAverage) : null;
      const bestValue = toDisplayValue(chartData[0].totalAverage);

      return {
        currentValue,
        deltaFromPrevious: previousValue !== null ? Math.round(currentValue - previousValue) : null,
        deltaFromBest: Math.round(currentValue - bestValue),
        slowdownFromPrevious: formatSlowdown(previousValue, currentValue),
        slowdownFromBest: idx === 0 ? "" : formatSlowdown(bestValue, currentValue)
      };
    });

    // Build rows with consistent metric ordering
    const rows = chartData.map((data, idx) => {
      const metricValues = metrics.map(metric => {
        const value = data.metricValues.find(mv => mv.metricName === metric.name);
        return value === undefined ? NaN : Math.round(toDisplayValue(value.average));
      });

      const stats = wholeUpdateStats[idx];
      const formatSigned = (n: number | null): string => n === null ? "" : (n > 0 ? `+${n}` : `${n}`);
      return {
        displayName: data.displayName,
        values: [
          ...(groupBy.length > 0 ? [data.group ?? ""] : []),
          data.displayName,
          ...metricValues,
          useSignedDelta ? formatSigned(stats.deltaFromPrevious) : stats.slowdownFromPrevious,
          useSignedDelta ? formatSigned(stats.deltaFromBest) : stats.slowdownFromBest
        ]
      };
    });

    return { header, rows, wholeUpdateStats };
  };

  const tableStats = computeTableStats();

  // Table is drawn one row per save file (not one column per save file) so it stays readable
  // no matter how many results are being compared or how long their names are.
  const tableData = { header: tableStats.header, rows: tableStats.rows.map(row => ({ values: row.values })) };
  const tableRenderOptions = { flexColumnHeader: "Save File" };
  const tablePlugin = createTableChartPlugin(tableData, tableRenderOptions);

  const tableHeight = options.includeTable ? tableReservedHeight(tableStats.rows.length) : 0;
  const padding = options.includeTable ? { bottom: tableHeight } : undefined
  const recommendedHeight = chartLayout.BAR_CHART_CHROME_HEIGHT_PX + rows.length * chartLayout.MIN_BAR_ROW_HEIGHT_PX + tableHeight;
  // The y-axis tick labels (bar row names) sit outside the table's plot area, so a wide table
  // also needs room reserved for the longest one alongside the table's own column widths.
  const yAxisLabelWidth = Math.max(...chartLabels.map(label => estimateTextWidth(label.replace(SPACER_PREFIX, "▸ "))));
  const recommendedWidth = options.includeTable
    ? yAxisLabelWidth + chartLayout.TABLE_WIDTH_CHROME_PX + estimateTableWidth(tableData)
    : 0;

  datasets.sort((a, b) => {
    return Object.values(supportedMetrics).findIndex(it => it.description == a.label) - Object.values(supportedMetrics).findIndex(it => it.description == b.label)
  })

  let aggregationStrategyLabel = ""
  switch (options.aggregationStrategy) {
    case AggregationStrategy.AVERAGE:
      aggregationStrategyLabel = "Average"
      break;
    case AggregationStrategy.MINIMUM:
      aggregationStrategyLabel = "Minimum"
      break;
    case AggregationStrategy.MAXIMUM:
      aggregationStrategyLabel = "Maximum"
      break;
    case AggregationStrategy.MEDIAN:
      aggregationStrategyLabel = "Median"
      break;
    case AggregationStrategy.STANDARD_DEVIATION:
      aggregationStrategyLabel = "Standard Deviation"
  }

  const xAxisLabel = valueMode === "ups"
    ? `Updates per second using ${aggregationStrategyLabel.toLowerCase()} per tick (higher is better)`
    : `Average Time using ${aggregationStrategyLabel.toLowerCase()} per tick [microseconds] (lower is better)`

  const title = options.titleOverride ?? (valueMode === "ups"
    ? `${aggregationStrategyLabel} Updates Per Second${options.isPerRun ? " (Per Run)" : ""}`
    : (options.isPerRun
      ? `${aggregationStrategyLabel} Per Tick Metrics (Per Run)`
      : `${aggregationStrategyLabel} Per Tick Metrics`))


  const configuration: ChartConfiguration<"bar"> = {
    type: "bar",
    data: {
      labels: chartLabels,
      datasets: datasets
    },
    options: {
      indexAxis: "y", // horizontal bars
      layout: {
        // autoPadding: true,
        padding: padding
      },
      plugins: {
        title: {
          display: true,
          text: title,
          color: colors.white,
          font: {
            size: 18
          },
        },
        legend: {
          labels: {
            color: colors.white,
            // Pattern tile is 20×20; ensure swatch is tall enough to show a full repeat.
            boxHeight: 20,
            boxWidth: 40,
            // order by supported metric order
            sort: (a, b) => {
              return Object.values(supportedMetrics).findIndex(it => it.description == a.text) - Object.values(supportedMetrics).findIndex(it => it.description == b.text)
            }
          },
        }
      },
      scales: {
        x: {
          stacked: true,
          ticks: { color: colors.white, },
          title: { display: true, text: xAxisLabel, color: "white" },
          ...(options.maxUpdate != null ? { max: options.maxUpdate } : {}),
        },
        y: {
          stacked: true,
          ticks: {
            autoSkip: false,
            color: (ctx: any) =>
              chartLabels[ctx.index]?.startsWith(SPACER_PREFIX) ? colors.sky_blue : colors.white,
            font: (ctx: any) =>
              chartLabels[ctx.index]?.startsWith(SPACER_PREFIX)
                ? { weight: "bold" as const, size: 13 }
                : { size: 12 },
            callback: (value: any) => {
              const label = chartLabels[value] ?? "";
              return label.startsWith(SPACER_PREFIX) ? `▸ ${label.slice(1)}` : label;
            },
          },
          grid: {
            color: colors.dark_grey
          },
        },
      },
    },
    plugins: [backgroundPlugin, options.includeTable && tablePlugin].filter(Boolean) as any[],
  };

  const exportTable = options.csvTableExportName
    ? async () => {
        const exportName = options.csvTableExportName!;
        const csvContent = [
          tableStats.header.flat().join(","),
          ...tableStats.rows.map(row => row.values.join(","))
        ].join("\n");
        const markdownTable = [
          `|${tableStats.header.join("|")  }|`,
          `|${tableStats.header.map(() => "---").join("|")  }|`,
          ...tableStats.rows.map(row => `|${row.values.join("|")  }|`)
        ].join("\n");
        await fsp.writeFile(`${exportName}.csv`, csvContent);
        await fsp.writeFile(`${exportName}.md`, markdownTable);
      }
    : null;

  return { config: configuration, exportTable, recommendedHeight, recommendedWidth };

}