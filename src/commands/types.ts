import { MetricEnum } from "../data/MetricEnum";
import { AggregationStrategy } from "../data/AggregationStrategy";

// Base options shared by all chart types
export type BaseChartOptions = {
  width: number;
  height: number;
  output: string;
  removeFirstTicks: number;
  maxTicks: number;
  trimPrefix: string;
  customNames: Map<string, string>;
  namesFile: string;
  aggregateFile: string;
  stddevFilter: number;
  metrics: MetricEnum[];
  /** Hide any metric/entity whose max value never exceeds this % of its reference total. 0 = no filter. */
  minPercent: number;
  /** Capitalize the first letter of each underscore-separated word in chart labels. Bypassed by --name overrides. */
  titleCase: boolean;
};

// Summary chart specific options
export type SummaryChartOptions = BaseChartOptions & {
  aggregateStrategy: AggregationStrategy;
  summaryTable: boolean;
  summaryTableFile: boolean;
  titleOverride: string | null;
};

// Summary per-run chart specific options
export type SummaryPerRunChartOptions = SummaryChartOptions & {
  sortBy: "run" | "total";
};

// Line/Bar chart specific options
export type LineBarChartOptions = BaseChartOptions & {
  aggregateStrategy: AggregationStrategy;
  tickWindowAggregation: number;
  maxUpdate: number | null;
  type: "line" | "bar";
};

// Boxplot chart specific options
export type BoxPlotChartOptions = BaseChartOptions & {
  minUpdate: number | null;
  maxUpdate: number | null;
};

// Table chart specific options
export type TableChartOptions = BaseChartOptions & {
  aggregateStrategy: AggregationStrategy;
};

// Entity breakdown chart specific options
export type EntityBreakdownChartOptions = BaseChartOptions & {
  aggregateStrategy: AggregationStrategy;
  summaryTable: boolean;
  summaryTableFile: boolean;
  titleOverride: string | null;
  topN: number;
  perRun: boolean;
  sortBy: "run" | "total";
};

// Entity matrix chart specific options
export type EntityMatrixChartOptions = BaseChartOptions & {
  aggregateStrategy: AggregationStrategy;
  topN: number;
  titleOverride: string | null;
};

// Entity heatmap chart specific options
export type EntityHeatmapChartOptions = BaseChartOptions & {
  aggregateStrategy: AggregationStrategy;
  topN: number;
  normalize: "global" | "column" | "row";
  showValues: boolean;
  titleOverride: string | null;
};
