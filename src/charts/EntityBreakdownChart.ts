import type { ChartConfiguration } from "chart.js";
import fs from "fs";
import { AggregationStrategy } from "../data/AggregationStrategy";
import { BenchmarkAggregateRunResult, MetricAggregate } from "../data/BenchmarkAggregateResult";
import { MetricName } from "../data/Metric";
import { MetricEnum } from "../data/MetricEnum";
import { MetricRegistryInstance } from "../data/MetricRegistry";
import { nanoToMicro, percentDecrease } from "../utils";
import { colors } from "./constants";
import { getMetricPattern } from "./styles";

const OTHER_ENTITY_NAME = "otherEntityUpdate";
const OTHER_ENTITY_DESCRIPTION = "Other Entity Update";

interface EntityBreakdownMetricValue {
  metricName: string;
  metricDescription: string;
  average: number;
}

interface EntityBreakdownChartData {
  mapName: string;
  entityUpdateTotal: number;
  metricValues: EntityBreakdownMetricValue[];
}

export interface EntityBreakdownChartOptions {
  aggregationStrategy: AggregationStrategy;
  includeTable?: boolean;
  csvTableExportName?: string;
  titleOverride?: string;
  /**
   * Limit displayed entity children to the top N largest (by average across all results).
   * Remaining children are folded into the "Other Entity Update" slice. 0 = show all.
   */
  topN?: number;
  /**
   * "total" (default): sort bars by entityUpdate ascending.
   * "preserve": keep input order (used for per-run mode).
   */
  sortBy?: "total" | "preserve";
  /**
   * Whether this chart shows per-run data (affects default title).
   */
  isPerRun?: boolean;
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
    mapName: result.fileName,
    entityUpdateTotal,
    metricValues: childValues,
  };
};

export const createEntityBreakdownChartConfiguration = (
  results: BenchmarkAggregateRunResult[],
  options: EntityBreakdownChartOptions,
): ChartConfiguration<"bar"> => {
  const allEntityChildren = MetricRegistryInstance
    .getChildrenOf(MetricEnum.ENTITY_UPDATE.name)
    .map(m => m.name);

  const rawChartData = results.map(result => mapEntityBreakdownData(result, allEntityChildren));

  if (options.sortBy !== "preserve") {
    rawChartData.sort((a, b) => a.entityUpdateTotal - b.entityUpdateTotal);
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

  const topN = options.topN ?? 0;
  const displayedChildren = topN > 0 ? rankedChildren.slice(0, topN) : rankedChildren;
  const displayedSet = new Set(displayedChildren);

  // Fold non-displayed children + structural remainder into "Other Entity Update".
  const chartData: EntityBreakdownChartData[] = rawChartData.map(data => {
    const displayedValues = data.metricValues.filter(mv => displayedSet.has(mv.metricName));
    const sumDisplayed = displayedValues.reduce((sum, mv) => sum + mv.average, 0);
    const otherAvg = Math.max(0, data.entityUpdateTotal - sumDisplayed);
    return {
      mapName: data.mapName,
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

  const datasets = datasetOrder.map(name => ({
    label: datasetDescriptions.get(name)!,
    data: chartData.map(data => data.metricValues.find(mv => mv.metricName === name)?.average ?? 0),
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
      "% Decrease from Previous",
      "% Decrease from Best",
    ];

    const totalStats = chartData.map((data, idx) => {
      const currentValue = data.entityUpdateTotal;
      const previousValue = idx > 0 ? chartData[idx - 1].entityUpdateTotal : null;
      const bestValue = chartData[0].entityUpdateTotal;
      return {
        currentValue,
        decreaseFromPrevious: previousValue ? Math.round(percentDecrease(previousValue, currentValue) * 100) / 100 : null,
        decreaseFromBest: bestValue ? Math.round(percentDecrease(bestValue, currentValue) * 100) / 100 : null,
      };
    });

    const rows = chartData.map((data, idx) => {
      const stats = totalStats[idx];
      const metricValues = tableHeaderMetrics.map(m => {
        const value = data.metricValues.find(mv => mv.metricName === m.name);
        return value ? parseFloat(value.average.toFixed(2)) : NaN;
      });
      return {
        mapName: data.mapName,
        values: [
          data.mapName,
          ...metricValues,
          parseFloat(data.entityUpdateTotal.toFixed(2)),
          stats.decreaseFromPrevious === null ? "" : `${stats.decreaseFromPrevious}%`,
          stats.decreaseFromBest === null ? "" : `${stats.decreaseFromBest}%`,
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

  // Rows drawn: header(0), N metric rows(1..N), Entity Update Total(N+1),
  // % Decrease from Previous(N+2), % Decrease from Best(N+3). Total = N+4 rows.
  const ROW_HEIGHT = 20;
  const TABLE_BOTTOM_PADDING = 16;
  const tableRowCount = tableHeaderMetrics.length + 4;
  const tableReservedHeight = tableRowCount * ROW_HEIGHT + TABLE_BOTTOM_PADDING;
  const tablePlugin = {
    id: "valueTable",
    afterDraw: (chart: any) => {
      const { ctx, chartArea: { left, right }, height } = chart;
      ctx.save();

      const tableTop = height - tableReservedHeight + ROW_HEIGHT;
      const rowHeight = ROW_HEIGHT;

      ctx.font = "bold 12px Arial";
      const header = ["Category", ...chartData.map(d => d.mapName)];

      const columnMinWidths = header.map((text, colIdx) => {
        let maxWidth = ctx.measureText(text).width;
        if (colIdx > 0) {
          const dataIdx = colIdx - 1;
          tableHeaderMetrics.forEach(m => {
            const mv = chartData[dataIdx]?.metricValues.find(it => it.metricName === m.name);
            const valueText = `${(mv?.average ?? 0).toFixed(2)}`;
            maxWidth = Math.max(maxWidth, ctx.measureText(valueText).width);
          });
          maxWidth = Math.max(maxWidth, ctx.measureText(`${(chartData[dataIdx]?.entityUpdateTotal ?? 0).toFixed(2)}`).width);
          const stats = tableStats.totalStats[dataIdx];
          if (stats?.decreaseFromPrevious !== null && stats?.decreaseFromPrevious !== undefined) {
            maxWidth = Math.max(maxWidth, ctx.measureText(`${stats.decreaseFromPrevious}%`).width);
          }
          if (stats?.decreaseFromBest !== null && stats?.decreaseFromBest !== undefined) {
            maxWidth = Math.max(maxWidth, ctx.measureText(`${stats.decreaseFromBest}%`).width);
          }
        } else {
          tableHeaderMetrics.forEach(m => {
            maxWidth = Math.max(maxWidth, ctx.measureText(m.description).width);
          });
          maxWidth = Math.max(maxWidth, ctx.measureText("Entity Update Total").width);
          maxWidth = Math.max(maxWidth, ctx.measureText("% Decrease from Previous").width);
          maxWidth = Math.max(maxWidth, ctx.measureText("% Decrease from Best").width);
        }
        return maxWidth + 16;
      });

      const totalMinWidth = columnMinWidths.reduce((sum, w) => sum + w, 0);
      const availableWidth = right - left;
      const scale = availableWidth / totalMinWidth;
      const columnWidths = columnMinWidths.map(w => w * scale);

      const columnPositions = [left];
      for (let i = 0; i < columnWidths.length - 1; i++) {
        columnPositions.push(columnPositions[i] + columnWidths[i]);
      }

      ctx.font = "bold 12px Arial";
      ctx.textAlign = "center";
      ctx.fillStyle = "white";

      header.forEach((category, i) => {
        ctx.fillText(category, columnPositions[i] + columnWidths[i] / 2, tableTop);
      });

      ctx.font = "12px Arial";
      tableHeaderMetrics.forEach((m, rowIdx) => {
        const y = tableTop + (rowIdx + 1) * rowHeight;
        ctx.fillText(m.description, columnPositions[0] + columnWidths[0] / 2, y);
        chartData.forEach((res, colIdx) => {
          const mv = res.metricValues.find(it => it.metricName === m.name);
          const avg = (mv?.average ?? 0).toFixed(2);
          ctx.fillText(`${avg}`, columnPositions[colIdx + 1] + columnWidths[colIdx + 1] / 2, y);
        });
      });

      let nextRow = tableTop + (tableHeaderMetrics.length + 1) * rowHeight;

      ctx.font = "bold 12px Arial";
      ctx.fillText("Entity Update Total", columnPositions[0] + columnWidths[0] / 2, nextRow);
      chartData.forEach((data, colIdx) => {
        ctx.fillText(`${data.entityUpdateTotal.toFixed(2)}`, columnPositions[colIdx + 1] + columnWidths[colIdx + 1] / 2, nextRow);
      });

      ctx.font = "12px Arial";
      nextRow += rowHeight;
      ctx.fillText("% Decrease from Previous", columnPositions[0] + columnWidths[0] / 2, nextRow);
      tableStats.totalStats.forEach((stats, colIdx) => {
        if (stats.decreaseFromPrevious !== null) {
          ctx.fillText(`${stats.decreaseFromPrevious}%`, columnPositions[colIdx + 1] + columnWidths[colIdx + 1] / 2, nextRow);
        }
      });

      nextRow += rowHeight;
      ctx.fillText("% Decrease from Best", columnPositions[0] + columnWidths[0] / 2, nextRow);
      tableStats.totalStats.forEach((stats, colIdx) => {
        if (stats.decreaseFromBest !== null) {
          ctx.fillText(`${stats.decreaseFromBest}%`, columnPositions[colIdx + 1] + columnWidths[colIdx + 1] / 2, nextRow);
        }
      });

      ctx.restore();
    },
  };

  const padding = options.includeTable ? { bottom: tableReservedHeight + 10 } : undefined;

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

  return {
    type: "bar",
    data: {
      labels: chartData.map(d => d.mapName),
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
          ticks: { color: colors.white },
          grid: { color: colors.dark_grey },
        },
      },
    },
    plugins: [backgroundPlugin, options.includeTable && tablePlugin, options.csvTableExportName && csvExportPlugin].filter(Boolean) as any[],
  };
};
