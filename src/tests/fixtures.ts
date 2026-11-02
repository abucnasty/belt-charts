import type { BenchmarkAggregateRunResult, MetricAggregate, MetricRunAggregate } from "../data/BenchmarkAggregateResult";
import type { MetricName } from "../data/Metric";
import { MetricRegistryInstance } from "../data/MetricRegistry";

/** Nanoseconds per microsecond; fixtures are written in microseconds for readability. */
const NS = 1000;

const aggregate = (micro: number): MetricAggregate => ({
  average: micro * NS,
  standardDeviation: micro * NS * 0.05,
  minimum: micro * NS * 0.9,
  maximum: micro * NS * 1.1,
  median: micro * NS,
});

export type FixtureOptions = {
  inputSuffix?: string;
  group?: string;
  /** Per-run means (µs) per metric; defaults to a single run equal to the metric's value. */
  runMeans?: Partial<Record<MetricName, number[]>>;
};

/**
 * Builds an aggregate result from per-metric averages in microseconds, e.g.
 * `makeResult("4i", { wholeUpdate: 1700, entityUpdate: 1400, Inserter: 800 })`.
 */
export const makeResult = (
  name: string,
  micros: Partial<Record<MetricName, number>>,
  options: FixtureOptions = {},
): BenchmarkAggregateRunResult => {
  const names = Object.keys(micros) as MetricName[];
  const runs = new Map<MetricName, MetricRunAggregate[]>();
  for (const metricName of names) {
    const means = options.runMeans?.[metricName] ?? [micros[metricName]!];
    runs.set(metricName, means.map((mean, run) => ({ ...aggregate(mean), run })));
  }
  return {
    originalFileName: name,
    displayName: options.inputSuffix ? `${name} (${options.inputSuffix})` : name,
    group: options.group,
    inputSuffix: options.inputSuffix,
    metrics: names.map((metricName) => MetricRegistryInstance.getOrThrow(metricName)),
    runs,
    all: new Map(names.map((metricName) => [metricName, aggregate(micros[metricName]!)])),
  };
};
