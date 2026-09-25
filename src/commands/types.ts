import { MetricEnum } from "../data/MetricEnum";
import { AggregationStrategy } from "../data/AggregationStrategy";
import { Easing } from "../charts/animation";

// Options for rendering a chart as an animated MP4 instead of a static image
export type AnimationOptions = {
  animate: boolean;
  duration: number;
  fps: number;
  easing: Easing;
  /** Extra seconds to hold the final frame at the end of the animation. */
  hold: number;
};

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
  /** List of substrings to remove from chart labels. Applied after --trim-prefix and before --title-case. */
  trimSubstrings: string[];
  /** Comma-separated group keys. Each result is assigned to the longest matching key that is a substring of its fileName. Results not matching any key are excluded. */
  groupBy: string[];
  /** Override the chart's auto-generated title. Null = use the chart's default title. */
  titleOverride: string | null;
};

// Summary chart specific options
export type SummaryChartOptions = BaseChartOptions & AnimationOptions & {
  aggregateStrategy: AggregationStrategy;
  summaryTable: boolean;
  summaryTableFile: boolean;
  maxUpdate: number | null;
  /** Bypass the MetricProfiles.SUMMARY_CHART filter and render any metric provided via --metrics. */
  allowUnfilteredMetrics: boolean;
};

// Summary per-run chart specific options
export type SummaryPerRunChartOptions = SummaryChartOptions & {
  sortBy: "run" | "total";
};

// Line/Bar chart specific options
export type LineBarChartOptions = BaseChartOptions & AnimationOptions & {
  aggregateStrategy: AggregationStrategy;
  tickWindowAggregation: number;
  maxUpdate: number | null;
  type: "line" | "bar";
  /** Bypass any built-in metric filter and render any metric provided via --metrics. */
  allowUnfilteredMetrics: boolean;
};

// Boxplot chart specific options
export type BoxPlotChartOptions = BaseChartOptions & AnimationOptions & {
  minUpdate: number | null;
  maxUpdate: number | null;
};

// Table chart specific options
export type TableChartOptions = BaseChartOptions & {
  aggregateStrategy: AggregationStrategy;
};

// Entity breakdown chart specific options
export type EntityBreakdownChartOptions = BaseChartOptions & AnimationOptions & {
  aggregateStrategy: AggregationStrategy;
  summaryTable: boolean;
  summaryTableFile: boolean;
  topN: number;
  perRun: boolean;
  sortBy: "run" | "total";
};

// Entity matrix chart specific options
export type EntityMatrixChartOptions = BaseChartOptions & {
  aggregateStrategy: AggregationStrategy;
  topN: number;
};

// Entity heatmap chart specific options
export type EntityHeatmapChartOptions = BaseChartOptions & {
  aggregateStrategy: AggregationStrategy;
  topN: number;
  normalize: "global" | "column" | "row";
  showValues: boolean;
};

// Core frequency heatmap chart specific options
export type CoreFrequencyHeatmapChartOptions = Pick<
  BaseChartOptions,
  "width" | "height" | "output" | "trimPrefix" | "customNames" | "namesFile" |
  "aggregateFile" | "stddevFilter" | "titleCase" | "trimSubstrings" | "groupBy" | "titleOverride"
> & {
  aggregateStrategy: AggregationStrategy;
  normalize: "global" | "column" | "row";
  showValues: boolean;
  /** Glob patterns (repeatable, OR-matched) filtering which save_name values are included. Empty = all. */
  saveNameFilters: string[];
};
