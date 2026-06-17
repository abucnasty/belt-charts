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
  aggregateFile: string;
  stddevFilter: number;
  metrics: MetricEnum[];
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
