import type { ChartConfiguration } from "chart.js";
import fsp from "node:fs/promises";
import { AggregationStrategy } from "../data/AggregationStrategy";
import { BenchmarkAggregateRunResult, MetricAggregate } from "../data/BenchmarkAggregateResult";
import { MetricName } from "../data/Metric";
import { MetricEnum } from "../data/MetricEnum";
import { MetricRegistryInstance } from "../data/MetricRegistry";
import { computeErrorBar, errorBarCells, errorBarColumns, overlapCell, type ErrorBar, type ErrorBarMode } from "../data/errorBars";
import { comparisonRows } from "../data/comparison";
import { groupLabel } from "../data/groupBy";
import { type BaselineOptions, formatPercentChange, formatSigned as formatSignedChange, hasBaseline, resolveBaselines } from "../data/baseline";
import { formatSlowdown, nanoToMicro } from "../utils";
import type { RowSort } from "../commands/types";
import { colors, chartLayout } from "./constants";
import { rowComparator } from "./rowOrder";
import { getMetricPattern } from "./styles";
import { scaled } from "./fonts";
import { subtitleOptions } from "./subtitle";
import { buildPaired, createSessionLabelsPlugin, pairedLegendLabels, pairLabelOf, sessionsOf } from "./paired";
import { createErrorBarsPlugin, patternAnchorPlugin, valueLabelsPlugin } from "./plugins";
import { createTableChartPlugin, estimateTableWidth, estimateTextWidth, tableReservedHeight } from "./Table";

const OTHER_ENTITY_NAME = "otherEntityUpdate";
const OTHER_ENTITY_DESCRIPTION = "Other Entity Update";

interface EntityBreakdownMetricValue {
  metricName: string;
  metricDescription: string;
  average: number;
}

interface EntityBreakdownChartData {
  displayName: string;
  originalFileName: string;
  /** Label suffix of the input this row came from (`--input <glob>:<suffix>`). */
  inputSuffix?: string;
  group?: string;
  entityUpdateTotal: number;
  /** Per-run means (µs) of the entity update, one value per run; empty for per-run (exploded) results. */
  entityUpdateRunMeans: number[];
  metricValues: EntityBreakdownMetricValue[];
}

export interface EntityBreakdownChartOptions extends BaselineOptions {
  aggregationStrategy: AggregationStrategy;
  includeTable?: boolean;
  csvTableExportName?: string;
  titleOverride?: string;
  /** Smaller text under the title. */
  subtitle?: string | null;
  topN?: number;
  minPercent?: number;
  sortBy?: "total" | "preserve";
  /** Row order (`--sort`): by total time (default), keep the incoming order, or by label. */
  sort?: RowSort;
  isPerRun?: boolean;
  groupBy?: string[];
  /** Heading per group key (`--group-by "key=Label"`) for the group headers; a key without one is shown as itself. */
  groupLabels?: Map<string, string>;
  valueLabels?: boolean;
  /** Draws the run-to-run spread of the per-run means of the bar's total on each bar, and adds it to the table. Ignored with a baseline. */
  errorBars?: ErrorBarMode;
  /** One row per save with one bar per input suffix ("session") side by side, instead of one row per file. */
  paired?: boolean;
}

export interface EntityBreakdownChartResult {
  config: ChartConfiguration<"bar">;
  exportTable: (() => Promise<void>) | null;
  /** The table drawn under the chart and exported by `exportTable`. */
  table: { header: string[]; rows: (string | number)[][] };
  /** Minimum canvas height (px) needed to fit every row/table without squishing; use as a floor over the user-requested height. */
  recommendedHeight: number;
  /** Minimum canvas width (px) needed to fit the summary table's columns without squishing; use as a floor over the user-requested width. */
  recommendedWidth: number;
}

const mapEntityBreakdownData = (
  result: BenchmarkAggregateRunResult,
  entityChildren: MetricName[],
): EntityBreakdownChartData => {
  const entityUpdateAgg: MetricAggregate | undefined = result.all.get(MetricEnum.ENTITY_UPDATE.name);
  const entityUpdateTotal = entityUpdateAgg ? nanoToMicro(entityUpdateAgg.average) : 0;

  const childValues = entityChildren.flatMap(name => {
    const agg = result.all.get(name);
    if (!agg) return [];
    const metric = MetricRegistryInstance.get(name);
    if (!metric) return [];
    return [{
      metricName: name,
      metricDescription: metric.description,
      average: nanoToMicro(agg.average),
    }];
  });

  return {
    displayName: result.displayName,
    originalFileName: result.originalFileName,
    inputSuffix: result.inputSuffix,
    group: result.group,
    entityUpdateTotal,
    entityUpdateRunMeans: (result.runs.get(MetricEnum.ENTITY_UPDATE.name) ?? []).map(run => nanoToMicro(run.average)),
    metricValues: childValues,
  };
};

export const createEntityBreakdownChartConfiguration = (
  results: BenchmarkAggregateRunResult[],
  options: EntityBreakdownChartOptions,
): EntityBreakdownChartResult => {
  const allEntityChildren = MetricRegistryInstance
    .getChildrenOf(MetricEnum.ENTITY_UPDATE.name)
    .map(m => m.name);

  const rawChartData = results.map(result => mapEntityBreakdownData(result, allEntityChildren));

  const compareRows = rowComparator<EntityBreakdownChartData>(options.sort ?? "total", d => d.entityUpdateTotal);
  if (options.sortBy !== "preserve") {
    rawChartData.sort(compareRows);
  }

  const groupBy = options.groupBy ?? [];
  const getGroup = (data: { group?: string }): string | null => data.group ?? null;

  if (groupBy.length > 0) {
    const filtered = rawChartData.filter(d => getGroup(d) !== null);
    filtered.sort((a, b) => {
      const ai = groupBy.indexOf(getGroup(a)!);
      const bi = groupBy.indexOf(getGroup(b)!);
      if (ai !== bi) return ai - bi;
      return compareRows(a, b);
    });
    rawChartData.length = 0;
    rawChartData.push(...filtered);
  }

  // Determine which children to display: top-N by max-across-results.
  const childMaxByName = new Map<string, number>();
  rawChartData.forEach(data => {
    data.metricValues.forEach(mv => {
      const prev = childMaxByName.get(mv.metricName) ?? 0;
      if (mv.average > prev) {
        childMaxByName.set(mv.metricName, mv.average);
      }
    });
  });

  const rankedChildren = Array.from(childMaxByName.entries())
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);

  // Apply minPercent filter: hide children whose max value never exceeds minPercent% of entityUpdate.
  const minPercent = options.minPercent ?? 0;
  const filteredChildren = minPercent > 0
    ? rankedChildren.filter(name => {
        const maxVal = childMaxByName.get(name) ?? 0;
        const maxTotal = Math.max(...rawChartData.map(d => d.entityUpdateTotal));
        return maxTotal > 0 && (maxVal / maxTotal) * 100 >= minPercent;
      })
    : rankedChildren;

  const topN = options.topN ?? 0;
  const displayedChildren = topN > 0 ? filteredChildren.slice(0, topN) : filteredChildren;
  const displayedSet = new Set(displayedChildren);

  // Fold non-displayed children + structural remainder into "Other Entity Update".
  const chartData: EntityBreakdownChartData[] = rawChartData.map(data => {
    const displayedValues = data.metricValues.filter(mv => displayedSet.has(mv.metricName));
    const sumDisplayed = displayedValues.reduce((sum, mv) => sum + mv.average, 0);
    const otherAvg = Math.max(0, data.entityUpdateTotal - sumDisplayed);
    return {
      displayName: data.displayName,
      originalFileName: data.originalFileName,
      inputSuffix: data.inputSuffix,
      group: data.group,
      entityUpdateTotal: data.entityUpdateTotal,
      entityUpdateRunMeans: data.entityUpdateRunMeans,
      metricValues: [
        ...displayedValues,
        {
          metricName: OTHER_ENTITY_NAME,
          metricDescription: OTHER_ENTITY_DESCRIPTION,
          average: otherAvg,
        },
      ],
    };
  });

  // With a baseline every segment is drawn as its change against the baseline row's segment.
  const baselineOf: number[] | null = hasBaseline(options) ? resolveBaselines(chartData, options) : null;
  const isDelta = baselineOf !== null;
  const segmentValue = (idx: number, metricName: string): number => {
    const of = (i: number) => chartData[i].metricValues.find(mv => mv.metricName === metricName)?.average ?? 0;
    return of(idx) - (isDelta ? of(baselineOf![idx]) : 0);
  };
  // The baseline row itself is all zeros, so mark it.
  const rowName = (idx: number): string =>
    isDelta && baselineOf![idx] === idx ? `${chartData[idx].displayName} (baseline)` : chartData[idx].displayName;

  // Spread of the per-run means of the entity update.
  const errorBarMode = isDelta ? undefined : options.errorBars;
  const errorBars: (ErrorBar | null)[] = errorBarMode
    ? chartData.map(data => computeErrorBar(data.entityUpdateRunMeans, errorBarMode, data.entityUpdateTotal))
    : [];

  // Datasets — one stacked dataset per displayed child + one for "other".
  const datasetOrder = [...displayedChildren, OTHER_ENTITY_NAME];
  const datasetDescriptions = new Map<string, string>([
    ...displayedChildren.map(name => [name, MetricRegistryInstance.getOrThrow(name).description] as [string, string]),
    [OTHER_ENTITY_NAME, OTHER_ENTITY_DESCRIPTION],
  ]);

  // Build interleaved row structure: group header spacers + data rows.
  const SPACER_PREFIX = "\u200B";
  type ChartRow = { kind: "data"; idx: number } | { kind: "spacer"; groupLabel: string };
  const rows: ChartRow[] = [];
  if (groupBy.length > 0) {
    let lastGroup: string | null = null;
    chartData.forEach((data, idx) => {
      const group = getGroup(data)!;
      if (group !== lastGroup) {
        rows.push({ kind: "spacer", groupLabel: groupLabel(options.groupLabels, group) });
        lastGroup = group;
      }
      rows.push({ kind: "data", idx });
    });
  } else {
    chartData.forEach((_, idx) => rows.push({ kind: "data", idx }));
  }

  // Paired: one row per save, one bar per session (the input suffix), instead of one row per file.
  const sessions = options.paired ? sessionsOf(results) : [];
  const pairedLayout = options.paired
    ? buildPaired(
        chartData.map(data => ({
          label: pairLabelOf(data),
          session: data.inputSuffix!,
          group: data.group,
          total: data.entityUpdateTotal,
          segments: new Map(data.metricValues.map(mv => [mv.metricName, mv.average])),
        })),
        datasetOrder.map(name => ({ name, description: datasetDescriptions.get(name)! })),
        {
          sessions,
          groupBy,
          groupLabels: options.groupLabels,
          sort: options.sort ?? "total",
          singleBar: false,
          digits: 2,
          totalLabel: "Entity Update",
          spacerPrefix: SPACER_PREFIX,
        },
      )
    : null;

  const chartLabels = pairedLayout ? pairedLayout.labels : rows.map(row =>
    row.kind === "spacer" ? SPACER_PREFIX + row.groupLabel : rowName(row.idx)
  );

  const datasets: any[] = pairedLayout
    ? pairedLayout.datasets.map(d => ({
        label: d.label,
        stack: d.stack,
        data: d.data,
        backgroundColor: getMetricPattern(d.segmentName!),
      }))
    : datasetOrder.map(name => ({
        label: datasetDescriptions.get(name)!,
        data: rows.map(row => row.kind === "spacer" ? null : segmentValue(row.idx, name)),
        backgroundColor: getMetricPattern(name),
      }));
  // The first dataset of each session, where its name is drawn.
  const firstDatasetBySession = new Map<number, string>();
  pairedLayout?.datasets.forEach((d, i) => {
    if (![...firstDatasetBySession.values()].includes(d.session)) firstDatasetBySession.set(i, d.session);
  });

  const backgroundPlugin = {
    id: "customBackground",
    beforeDraw: (chart: any) => {
      const { ctx, width, height } = chart;
      ctx.save();
      ctx.fillStyle = "black";
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    },
  };

  const tableHeaderMetrics = datasetOrder.map(name => ({
    name,
    description: datasetDescriptions.get(name)!,
  }));

  const totalLabel = "Entity Update";

  // Baseline table: the segments are changes against the baseline row, plus the total's percent
  // change and its absolute value.
  const computeBaselineTableStats = () => {
    const header = [
      "Save File",
      ...tableHeaderMetrics.map(m => `Δ ${m.description}`),
      `Δ ${totalLabel}`,
      `Δ ${totalLabel} %`,
      `${totalLabel} Total`,
    ];
    const rows = chartData.map((data, idx) => {
      const base = chartData[baselineOf![idx]];
      const deltas = tableHeaderMetrics.map(m => formatSignedChange(segmentValue(idx, m.name)));
      return {
        displayName: data.displayName,
        values: [
          rowName(idx),
          ...deltas,
          formatSignedChange(data.entityUpdateTotal - base.entityUpdateTotal),
          formatPercentChange(base.entityUpdateTotal, data.entityUpdateTotal),
          parseFloat(data.entityUpdateTotal.toFixed(2)),
        ],
      };
    });
    return { header, rows, totalStats: [] as unknown[] };
  };

  const computeTableStats = () => {
    if (isDelta) return computeBaselineTableStats();
    const header = [
      "Save File",
      ...tableHeaderMetrics.map(m => m.description),
      "Entity Update Total",
      "vs Prev",
      "vs Best",
      ...(errorBarMode ? errorBarColumns(errorBarMode, totalLabel) : []),
    ];

    // Rows are compared with the row above and with the best row, both inside their group.
    const compareWith = comparisonRows(chartData.map(data => data.entityUpdateTotal), groupBy.length > 0 ? chartData.map(data => data.group) : undefined);
    const totalStats = chartData.map((data, idx) => {
      const currentValue = data.entityUpdateTotal;
      const previousValue = compareWith.previous[idx] !== null ? chartData[compareWith.previous[idx]!].entityUpdateTotal : null;
      const bestIdx = compareWith.best[idx];
      const bestValue = chartData[bestIdx].entityUpdateTotal;
      return {
        currentValue,
        slowdownFromPrevious: formatSlowdown(previousValue, currentValue),
        slowdownFromBest: idx === bestIdx ? "" : formatSlowdown(bestValue, currentValue),
      };
    });

    const rows = chartData.map((data, idx) => {
      const stats = totalStats[idx];
      const metricValues = tableHeaderMetrics.map(m => {
        const value = data.metricValues.find(mv => mv.metricName === m.name);
        return value ? parseFloat(value.average.toFixed(2)) : NaN;
      });
      return {
        displayName: data.displayName,
        values: [
          data.displayName,
          ...metricValues,
          parseFloat(data.entityUpdateTotal.toFixed(2)),
          stats.slowdownFromPrevious,
          stats.slowdownFromBest,
          ...(errorBarMode ? [...errorBarCells(errorBars[idx], errorBarMode), overlapCell(errorBars[compareWith.previous[idx] ?? -1], errorBars[idx])] : []),
        ],
      };
    });

    return { header, rows, totalStats };
  };

  const tableStats = pairedLayout
    ? { header: pairedLayout.table.header, rows: pairedLayout.table.rows.map(values => ({ displayName: String(values[0]), values })) }
    : computeTableStats();

  // Table is drawn one row per save file (not one column per save file) so it stays readable
  // no matter how many results are being compared or how long their names are.
  const tableData = { header: tableStats.header, rows: tableStats.rows.map(row => ({ values: row.values })) };
  const tableRenderOptions = { flexColumnHeader: "Save File" };
  const tablePlugin = createTableChartPlugin(tableData, tableRenderOptions);

  const tableReservedHeightPx = tableReservedHeight(tableStats.rows.length);
  const padding = options.includeTable ? { bottom: tableReservedHeightPx } : undefined;
  const recommendedHeight = chartLayout.BAR_CHART_CHROME_HEIGHT_PX
    + chartLabels.length * (pairedLayout ? sessions.length : 1) * chartLayout.MIN_BAR_ROW_HEIGHT_PX
    + (options.includeTable ? tableReservedHeightPx : 0);
  // The y-axis tick labels (bar row names) sit outside the table's plot area, but the table's
  // flex "Save File" column is drawn in that same blank strip (not inside the plot area), so
  // only the wider of the two needs to be reserved once, not both added together.
  const yAxisLabelWidth = Math.max(...chartLabels.map(label => estimateTextWidth(label.replace(SPACER_PREFIX, "▸ "))));
  const recommendedWidth = options.includeTable
    ? yAxisLabelWidth + chartLayout.TABLE_WIDTH_CHROME_PX + estimateTableWidth(tableData, tableRenderOptions.flexColumnHeader)
    : 0;

  let aggregationStrategyLabel = "";
  switch (options.aggregationStrategy) {
    case AggregationStrategy.AVERAGE:
      aggregationStrategyLabel = "Average";
      break;
    case AggregationStrategy.MINIMUM:
      aggregationStrategyLabel = "Minimum";
      break;
    case AggregationStrategy.MAXIMUM:
      aggregationStrategyLabel = "Maximum";
      break;
    case AggregationStrategy.MEDIAN:
      aggregationStrategyLabel = "Median";
      break;
    case AggregationStrategy.STANDARD_DEVIATION:
      aggregationStrategyLabel = "Standard Deviation";
      break;
  }

  const xAxisLabel = isDelta
    ? `Change in ${totalLabel} time vs baseline, using ${aggregationStrategyLabel.toLowerCase()} per tick [microseconds] (left of zero is faster)`
    : `${totalLabel} time using ${aggregationStrategyLabel.toLowerCase()} per tick [microseconds] (lower is better)`;
  const titleSuffix = isDelta ? " vs Baseline" : "";
  const title = options.titleOverride ?? (options.isPerRun
    ? `${aggregationStrategyLabel} Per Tick Entity Breakdown${titleSuffix} (Per Run)`
    : `${aggregationStrategyLabel} Per Tick Entity Breakdown${titleSuffix}`);

  // Sort datasets so legend matches stack visual order (largest first looks cleaner).
  const datasetRankByName = new Map<string, number>(datasetOrder.map((name, idx) => [name, idx]));
  if (!pairedLayout) datasets.sort((a, b) => {
    const aName = datasetOrder.find(n => datasetDescriptions.get(n) === a.label) ?? "";
    const bName = datasetOrder.find(n => datasetDescriptions.get(n) === b.label) ?? "";
    return (datasetRankByName.get(aName) ?? 0) - (datasetRankByName.get(bName) ?? 0);
  });

  const config: ChartConfiguration<"bar"> = {
    type: "bar",
    data: {
      labels: chartLabels,
      datasets,
    },
    options: {
      indexAxis: "y",
      layout: {
        padding,
      },
      plugins: {
        title: {
          display: true,
          text: title,
          color: colors.white,
          font: { size: scaled(18) },
        },
        subtitle: subtitleOptions(options.subtitle),
        legend: {
          labels: {
            color: colors.white,
            // Pattern tile is 20×20; ensure swatch is tall enough to show a full repeat.
            boxHeight: 20,
            boxWidth: 40,
            ...(pairedLayout
              ? pairedLegendLabels(sessions, false, text => datasetOrder.findIndex(name => datasetDescriptions.get(name) === text))
              : {}),
          },
        },
      },
      scales: {
        x: {
          stacked: true,
          ticks: { color: colors.white },
          title: { display: true, text: xAxisLabel, color: "white" },
        },
        y: {
          stacked: true,
          ticks: {
            autoSkip: false,
            color: (ctx: any) =>
              chartLabels[ctx.index]?.startsWith(SPACER_PREFIX) ? colors.sky_blue : colors.white,
            font: (ctx: any) =>
              chartLabels[ctx.index]?.startsWith(SPACER_PREFIX)
                ? { weight: "bold" as const, size: scaled(13) }
                : { size: scaled(12) },
            callback: (value: any) => {
              const label = chartLabels[value] ?? "";
              return label.startsWith(SPACER_PREFIX) ? `▸ ${label.slice(1)}` : label;
            },
          },
          grid: { color: colors.dark_grey },
        },
      },
    },
    plugins: [backgroundPlugin, patternAnchorPlugin, options.includeTable && tablePlugin, options.valueLabels && valueLabelsPlugin, errorBarMode && createErrorBarsPlugin(rows.map(row => row.kind === "spacer" ? null : errorBars[row.idx])), pairedLayout && createSessionLabelsPlugin(firstDatasetBySession)].filter(Boolean) as any[],
  };

  const exportTable = options.csvTableExportName
    ? async () => {
        const exportName = options.csvTableExportName!;
        const csvContent = [
          tableStats.header.flat().join(","),
          ...tableStats.rows.map(row => row.values.join(",")),
        ].join("\n");
        const markdownTable = [
          `|${tableStats.header.join("|")}|`,
          `|${tableStats.header.map(() => "---").join("|")}|`,
          ...tableStats.rows.map(row => `|${row.values.join("|")}|`),
        ].join("\n");
        await fsp.writeFile(`${exportName}.csv`, csvContent);
        await fsp.writeFile(`${exportName}.md`, markdownTable);
      }
    : null;

  return { config, exportTable, table: { header: tableStats.header, rows: tableStats.rows.map(row => row.values) }, recommendedHeight, recommendedWidth };
};
