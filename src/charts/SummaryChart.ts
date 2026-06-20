import { AggregationStrategy } from "../data/AggregationStrategy"
import { MetricName } from "../data/Metric"
import { MetricEnum } from "../data/MetricEnum"
import { MetricProfiles, MetricRegistryInstance, toMetricRecord } from "../data/MetricRegistry"
import { nanoToMicro, percentDecrease } from "../utils"
import { colors, chartLayout } from "./constants"
import type { ChartConfiguration } from "chart.js";
import { BenchmarkAggregateRunResult, MetricAggregate } from "../data/BenchmarkAggregateResult"
import fsp from "node:fs/promises";
import { getMetricPattern } from "./styles"
import { backgroundPlugin } from "./plugins"

const supportedMetrics = toMetricRecord(MetricProfiles.SUMMARY_CHART);

interface SummaryChartMetricValue {
  metricName: string;
  metricDescription: string;
  average: number;
  min?: number;
  max?: number;
}

interface SummaryChartData {
  mapName: string;
  totalAverage: number;
  metrics: Array<MetricEnum>;
  metricValues: SummaryChartMetricValue[];
}

const mapSummaryChartData = (result: BenchmarkAggregateRunResult, configuredMetrics: Partial<Record<MetricName, MetricEnum>>, aggregationStrategy: AggregationStrategy): SummaryChartData => {
  const fileName = result.fileName;
  const metrics = result.metrics;

  let include_other = true;

  if (configuredMetrics[MetricEnum.HEAT_NETWORK_UPDATE.name] || configuredMetrics[MetricEnum.FLUID_FLOW_UPDATE.name]) {
    // other is not computable if these metrics are included since they are part of the electricHeatFluidCircuitUpdate metric
    include_other = false;
  }


  const otherMetricAverages = metrics
    .filter(it => it.name !== MetricEnum.WHOLE_UPDATE.name)
    .filter(it => configuredMetrics[it.name] != undefined)
    .filter(it => supportedMetrics[it.name] != MetricEnum.OTHER)
    .flatMap(metric => {
      const metricAggregate = result.all.get(metric.name)
      if (!metricAggregate) {
        return []
      }
      return [{
        metricName: metric.name,
        metricDescription: metric.description,
        average: nanoToMicro(metricAggregate.average),
        min: nanoToMicro(metricAggregate.minimum),
        max: nanoToMicro(metricAggregate.maximum)
      }]
    })
    .sort((a, b) => b.average - a.average); // Descending order

  const sumOfParts = otherMetricAverages.reduce((sum, metricAverage) => sum + metricAverage.average, 0);

  const wholeUpdateAgg: MetricAggregate | undefined = result.all.get(MetricEnum.WHOLE_UPDATE.name)

  const metricValues: SummaryChartMetricValue[] = [
    ...otherMetricAverages,
  ]

  if (!wholeUpdateAgg) {
    return {
      mapName: result.fileName,
      metrics: metricValues.map(it => MetricRegistryInstance.getOrThrow(it.metricName)),
      metricValues: metricValues,
      totalAverage: sumOfParts,
    }
  }



  const wholeUpdateAverage = nanoToMicro(wholeUpdateAgg.average);
  const otherAvg = wholeUpdateAverage - sumOfParts;

  if (include_other) {
    metricValues.push({
      metricName: MetricEnum.OTHER.name,
      metricDescription: MetricEnum.OTHER.description,
      average: otherAvg,
    })
  }

  metricValues.push({
    metricName: MetricEnum.WHOLE_UPDATE.name,
    metricDescription: MetricEnum.WHOLE_UPDATE.description,
    average: wholeUpdateAverage,
    min: nanoToMicro(wholeUpdateAgg.minimum),
    max: nanoToMicro(wholeUpdateAgg.maximum)
  })

  return {
    mapName: result.fileName,
    metrics: metricValues.map(it => MetricRegistryInstance.getOrThrow(it.metricName)),
    metricValues: metricValues,
    totalAverage: wholeUpdateAverage,
  }
}

interface SummaryChartOptions {
  aggregationStrategy: AggregationStrategy;
  /**
   * metrics to plot
   */
  metrics?: MetricEnum[];
  includeTable?: boolean;
  csvTableExportName?: string;
  titleOverride?: string;
  /**
   * How to sort the chart data.
   * "total" (default): sort by totalAverage ascending (current behavior)
   * "preserve": keep input order (e.g., for pre-sorted per-run data)
   */
  sortBy?: "total" | "preserve";
  /**
   * Whether this chart shows per-run data (affects default title)
   */
  isPerRun?: boolean;
}

export interface SummaryChartResult {
  config: ChartConfiguration<"bar">;
  exportTable: (() => Promise<void>) | null;
}

export const createSummaryChartConfiguration = (results: BenchmarkAggregateRunResult[], options: SummaryChartOptions): SummaryChartResult => {


  let configuredDisplayMetrics: Partial<Record<MetricName, MetricEnum>> = {}
  if (options.metrics) {
    options.metrics
      .filter(it => supportedMetrics[it.name] != undefined)
      .forEach(metric => configuredDisplayMetrics[metric.name] = metric)
  } else {
    configuredDisplayMetrics = { ...supportedMetrics }
  }

  const chartData = results.map(result => mapSummaryChartData(result, configuredDisplayMetrics, options.aggregationStrategy));
  // Sort data by "Whole Update" total time ascending (unless sortBy is "preserve")
  if (options.sortBy !== "preserve") {
    chartData.sort((a, b) => a.totalAverage - b.totalAverage);
  }

  const metrics = Array.from(new Set(chartData.flatMap(it => it.metrics.map(metric => metric.name)))).map(metricName => MetricRegistryInstance.getOrThrow(metricName))

  const datasets = metrics
    .filter(metric => metric.name != MetricEnum.WHOLE_UPDATE.name) // Exclude wholeUpdate from stacked bars
    .map(metric => {
      return {
        label: metric.description,
        data: chartData.map(data => data.metricValues.find(it => it.metricName === metric.name)?.average || 0),
        backgroundColor: getMetricPattern(metric.name),
      }
    })

  // Compute shared statistics for both plugins
  const computeTableStats = () => {
    const header = [
      "Save File",
      ...metrics.map(it => it.description),
      '% Decrease from Previous',
      '% Decrease from Best'
    ];

    // Pre-compute whole update values and stats
    const wholeUpdateStats = chartData.map((data, idx) => {

      const currentValue = data.totalAverage;
      const previousValue = idx > 0 ? chartData[idx - 1].totalAverage : null;
      const bestValue = chartData[0].totalAverage;

      return {
        currentValue,
        decreaseFromPrevious: previousValue ? Math.round(percentDecrease(previousValue, currentValue) * 100) / 100 : null,
        decreaseFromBest: bestValue ? Math.round(percentDecrease(bestValue, currentValue) * 100) / 100 : null
      };
    });

    // Build rows with consistent metric ordering
    const rows = chartData.map((data, idx) => {
      const metricValues = metrics.map(metric => {
        const value = data.metricValues.find(mv => mv.metricName === metric.name);
        return Math.round(value?.average ?? NaN);
      });

      const stats = wholeUpdateStats[idx];
      return {
        mapName: data.mapName,
        values: [
          data.mapName,
          ...metricValues,
          stats.decreaseFromPrevious === null ? "" : `${stats.decreaseFromPrevious}%`,
          stats.decreaseFromBest === null ? "" : `${stats.decreaseFromBest}%`
        ]
      };
    });

    return { header, rows, wholeUpdateStats };
  };

  const tableStats = computeTableStats();

  const tablePlugin = {
    id: "valueTable",
    afterDraw: (chart: any) => {
      const { ctx, chartArea: { left, right }, height } = chart;
      ctx.save();

      // Start table lower down so it never overlaps
      const tableTop = height - (metrics.length + 3) * chartLayout.TABLE_ROW_HEIGHT_PX;
      const rowHeight = chartLayout.TABLE_ROW_HEIGHT_PX;

      // Measure text widths for each column to prevent overlap
      ctx.font = "bold 12px Arial";
      const header = ["Category", ...chartData.map(it => it.mapName)];

      // Calculate minimum width needed for each column based on content
      const columnMinWidths = header.map((text, colIdx) => {
        // Measure header text
        let maxWidth = ctx.measureText(text).width;

        // For data columns, also check metric values and percentage widths
        if (colIdx > 0) {
          const dataIdx = colIdx - 1;
          metrics.forEach(metric => {
            const metricValue = chartData[dataIdx]?.metricValues.find(it => it.metricName === metric.name);
            const valueText = `${Math.round(metricValue?.average ?? NaN)}`;
            maxWidth = Math.max(maxWidth, ctx.measureText(valueText).width);
          });
          // Check percentage text widths
          const stats = tableStats.wholeUpdateStats[dataIdx];
          if (stats?.decreaseFromPrevious !== null) {
            maxWidth = Math.max(maxWidth, ctx.measureText(`${stats.decreaseFromPrevious}%`).width);
          }
          if (stats?.decreaseFromBest !== null) {
            maxWidth = Math.max(maxWidth, ctx.measureText(`${stats.decreaseFromBest}%`).width);
          }
        } else {
          // For category column, check all metric descriptions
          metrics.forEach(metric => {
            maxWidth = Math.max(maxWidth, ctx.measureText(metric.description).width);
          });
          maxWidth = Math.max(maxWidth, ctx.measureText("% Decrease from Previous").width);
          maxWidth = Math.max(maxWidth, ctx.measureText("% Decrease from Best").width);
        }

        return maxWidth + chartLayout.TABLE_COLUMN_PADDING_PX; // Add padding
      });

      // Calculate total minimum width and scale proportionally to fit available space
      const totalMinWidth = columnMinWidths.reduce((sum, w) => sum + w, 0);
      const availableWidth = right - left;
      const scale = availableWidth / totalMinWidth;
      const columnWidths = columnMinWidths.map(w => w * scale);

      // Calculate column positions (left edge of each column)
      const columnPositions = [left];
      for (let i = 0; i < columnWidths.length - 1; i++) {
        columnPositions.push(columnPositions[i] + columnWidths[i]);
      }

      ctx.font = "bold 12px Arial";
      ctx.textAlign = "center";
      ctx.fillStyle = "white";

      // Header
      header.forEach((category, i) => {
        ctx.fillText(category, columnPositions[i] + columnWidths[i] / 2, tableTop);
      });

      // Data rows
      ctx.font = "12px Arial";
      metrics.forEach((metric, rowIdx) => {
        const y = tableTop + (rowIdx + 1) * rowHeight;
        ctx.fillText(metric.description, columnPositions[0] + columnWidths[0] / 2, y);
        chartData.forEach((res, colIdx) => {
          const metricValue = res.metricValues.find(it => it.metricName === metric.name);
          const average = Math.round(metricValue?.average ?? NaN);
          ctx.fillText(`${average}`, columnPositions[colIdx + 1] + columnWidths[colIdx + 1] / 2, y);
        });
      });

      let lastRowPos = tableTop + (metrics.length + 1) * rowHeight;

      // Decrease from previous
      ctx.fillText("% Decrease from Previous", columnPositions[0] + columnWidths[0] / 2, lastRowPos);
      tableStats.wholeUpdateStats.forEach((stats, colIdx) => {
        if (stats.decreaseFromPrevious !== null) {
          ctx.fillText(
            `${stats.decreaseFromPrevious}%`,
            columnPositions[colIdx + 1] + columnWidths[colIdx + 1] / 2,
            lastRowPos
          );
        }
      });

      // Decrease from best
      lastRowPos += rowHeight;
      ctx.fillText("% Decrease from Best", columnPositions[0] + columnWidths[0] / 2, lastRowPos);
      tableStats.wholeUpdateStats.forEach((stats, colIdx) => {
        if (stats.decreaseFromBest !== null) {
          ctx.fillText(
            `${stats.decreaseFromBest}%`,
            columnPositions[colIdx + 1] + columnWidths[colIdx + 1] / 2,
            lastRowPos
          );
        }
      });

      ctx.restore();
    },
  };

  const padding = options.includeTable ? { bottom: (metrics.length + 3) * chartLayout.TABLE_ROW_HEIGHT_PX + chartLayout.TABLE_BOTTOM_MARGIN_PX } : undefined

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

  const xAxisLabel = `Average Time using ${aggregationStrategyLabel.toLowerCase()} per tick [microseconds] (lower is better)`

  const title = options.titleOverride ?? (options.isPerRun 
    ? `${aggregationStrategyLabel} Per Tick Metrics (Per Run)` 
    : `${aggregationStrategyLabel} Per Tick Metrics`)


  const configuration: ChartConfiguration<"bar"> = {
    type: "bar",
    data: {
      labels: chartData.map((r) => r.mapName),
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
        },
        y: {
          stacked: true,
          ticks: { color: colors.white, },
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

  return { config: configuration, exportTable };

}