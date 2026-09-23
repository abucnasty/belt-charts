import { parseBenchmarkAggregatesPerRunResultFromCsv, type BenchmarkAggregateRunResult } from "../data/BenchmarkAggregateResult";
import { MetricRegistryInstance } from "../data/MetricRegistry";
import type { MetricName } from "../data/Metric";

export type AggregateParseTask = {
  taskType: "aggregateParse";
  file: string;
  fileIndex: number;
  runsToRemove: number[];
  maxTicks: number;
  removeFirstTicks: number;
  metricNames: MetricName[];
};

/** Executed inside a worker thread; returns the raw (unlabeled) aggregate result. */
export async function runAggregateParseWorkerTask(task: AggregateParseTask): Promise<BenchmarkAggregateRunResult> {
  return parseBenchmarkAggregatesPerRunResultFromCsv(
    task.file,
    task.removeFirstTicks,
    task.maxTicks,
    task.metricNames.map((name) => MetricRegistryInstance.getOrThrow(name)),
    new Set(task.runsToRemove),
  );
}
