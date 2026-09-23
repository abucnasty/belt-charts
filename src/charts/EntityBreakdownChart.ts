import type { ChartConfiguration } from "chart.js";
import fs from "fs";
import { AggregationStrategy } from "../data/AggregationStrategy";
import { BenchmarkAggregateRunResult, MetricAggregate } from "../data/BenchmarkAggregateResult";
import { MetricName } from "../data/Metric";
import { MetricEnum } from "../data/MetricEnum";
import { MetricRegistryInstance } from "../data/MetricRegistry";
import { formatSlowdown, nanoToMicro } from "../utils";
import { colors, chartLayout } from "./constants";
import { getMetricPattern } from "./styles";
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
  group?: string;
  entityUpdateTotal: number;
  metricValues: EntityBreakdownMetricValue[];
}

export interface EntityBreakdownChartOptions {
  aggregationStrategy: AggregationStrategy;
  includeTable?: boolean;
  csvTableExportName?: string;
  titleOverride?: string;
  topN?: number;
  minPercent?: number;
  sortBy?: "total" | "preserve";
  isPerRun?: boolean;
  /** Group keys for clustering bars. Each result is assigned to the longest matching key. Unmatched results are excluded. */
  groupBy?: string[];
}

export interface EntityBreakdownChartResult {
  config: ChartConfiguration<"bar">;
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
    group: result.group,
    entityUpdateTotal,
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

  if (options.sortBy !== "preserve") {
    rawChartData.sort((a, b) => a.entityUpdateTotal - b.entityUpdateTotal);
  }

  const groupBy = options.groupBy ?? [];
  const getGroup = (data: { group?: string }): string | null => data.group ?? null;

  if (groupBy.length > 0) {
    const filtered = rawChartData.filter(d => getGroup(d) !== null);
    filtered.sort((a, b) => {
      const ai = groupBy.indexOf(getGroup(a)!);
      const bi = groupBy.indexOf(getGroup(b)!);
      if (ai !== bi) return ai - bi;
      return a.entityUpdateTotal - b.entityUpdateTotal;
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
      group: data.group,
      entityUpdateTotal: data.entityUpdateTotal,
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

  const datasets = datasetOrder.map(name => ({
    label: datasetDescriptions.get(name)!,
    data: rows.map(row => row.kind === "spacer" ? null : (chartData[row.idx].metricValues.find(mv => mv.metricName === name)?.average ?? 0)),
    backgroundColor: getMetricPattern(name),
  }));

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

  const computeTableStats = () => {
    const header = [
      "Save File",
      ...tableHeaderMetrics.map(m => m.description),
      "Entity Update Total",
      "vs Prev",
      "vs Best",
    ];

    const totalStats = chartData.map((data, idx) => {
      const currentValue = data.entityUpdateTotal;
      const previousValue = idx > 0 ? chartData[idx - 1].entityUpdateTotal : null;
      const bestValue = chartData[0].entityUpdateTotal;
      return {
        currentValue,
        slowdownFromPrevious: formatSlowdown(previousValue, currentValue),
        slowdownFromBest: idx === 0 ? "" : formatSlowdown(bestValue, currentValue),
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
        ],
      };
    });

    return { header, rows, totalStats };
  };

  const tableStats = computeTableStats();

  const csvExportPlugin = {
    afterDraw: () => {
      if (!options.csvTableExportName) return;
      const csvContent = [
        tableStats.header.flat().join(","),
        ...tableStats.rows.map(row => row.values.join(",")),
      ].join("\n");
      const markdownTable = [
        `|${tableStats.header.join("|")}|`,
        `|${tableStats.header.map(() => "---").join("|")}|`,
        ...tableStats.rows.map(row => `|${row.values.join("|")}|`),
      ].join("\n");
      fs.writeFileSync(`${options.csvTableExportName}.csv`, csvContent);
      fs.writeFileSync(`${options.csvTableExportName}.md`, markdownTable);
    },
  };

  // Table is drawn one row per save file (not one column per save file) so it stays readable
  // no matter how many results are being compared or how long their names are.
  const tableData = { header: tableStats.header, rows: tableStats.rows.map(row => ({ values: row.values })) };
  const tableRenderOptions = { flexColumnHeader: "Save File" };
  const tablePlugin = createTableChartPlugin(tableData, tableRenderOptions);

  const tableReservedHeightPx = tableReservedHeight(tableStats.rows.length);
  const padding = options.includeTable ? { bottom: tableReservedHeightPx } : undefined;
  const recommendedHeight = chartLayout.BAR_CHART_CHROME_HEIGHT_PX
    + rows.length * chartLayout.MIN_BAR_ROW_HEIGHT_PX
    + (options.includeTable ? tableReservedHeightPx : 0);
  // The y-axis tick labels (bar row names) sit outside the table's plot area, so a wide table
  // also needs room reserved for the longest one alongside the table's own column widths.
  const yAxisLabelWidth = Math.max(...chartLabels.map(label => estimateTextWidth(label.replace(SPACER_PREFIX, "▸ "))));
  const recommendedWidth = options.includeTable
    ? yAxisLabelWidth + chartLayout.TABLE_WIDTH_CHROME_PX + estimateTableWidth(tableData)
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

  const xAxisLabel = `Entity Update time using ${aggregationStrategyLabel.toLowerCase()} per tick [microseconds] (lower is better)`;
  const title = options.titleOverride ?? (options.isPerRun
    ? `${aggregationStrategyLabel} Per Tick Entity Breakdown (Per Run)`
    : `${aggregationStrategyLabel} Per Tick Entity Breakdown`);

  // Sort datasets so legend matches stack visual order (largest first looks cleaner).
  const datasetRankByName = new Map<string, number>(datasetOrder.map((name, idx) => [name, idx]));
  datasets.sort((a, b) => {
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
          font: { size: 18 },
        },
        legend: {
          labels: {
            color: colors.white,
            // Pattern tile is 20×20; ensure swatch is tall enough to show a full repeat.
            boxHeight: 20,
            boxWidth: 40,
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
                ? { weight: "bold" as const, size: 13 }
                : { size: 12 },
            callback: (value: any) => {
              const label = chartLabels[value] ?? "";
              return label.startsWith(SPACER_PREFIX) ? `▸ ${label.slice(1)}` : label;
            },
          },
          grid: { color: colors.dark_grey },
        },
      },
    },
    plugins: [backgroundPlugin, options.includeTable && tablePlugin, options.csvTableExportName && csvExportPlugin].filter(Boolean) as any[],
  };

  return { config, recommendedHeight, recommendedWidth };
};
