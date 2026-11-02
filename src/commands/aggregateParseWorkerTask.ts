import { parseBenchmarkAggregatesPerRunResultFromCsv, type BenchmarkAggregateRunResult } from "../data/BenchmarkAggregateResult";
import { MetricRegistryInstance } from "../data/MetricRegistry";
import type { MetricName } from "../data/Metric";
import type { ChartInput } from "./inputs";
import { getBaseName } from "./utils";

export type AggregateParseTask = {
  taskType: "aggregateParse";
  file: string;
  fileIndex: number;
  runsToRemove: number[];
  maxTicks: number;
  removeFirstTicks: number;
  metricNames: MetricName[];
  /** Label suffix of the input this file came from; recorded on the result as `inputSuffix`. */
  suffix?: string;
};

/** One parse task per resolved input, in input order (`fileIndex` is the position in `inputs`). */
export function buildAggregateParseTasks(
  inputs: ChartInput[],
  runsToRemove: Map<string, Set<number>>,
  options: { maxTicks: number; removeFirstTicks: number },
  metricNames: MetricName[],
): AggregateParseTask[] {
  return inputs.map(({ file, suffix }, fileIndex) => ({
    taskType: "aggregateParse",
    file,
    fileIndex,
    runsToRemove: [...(runsToRemove.get(getBaseName(file)) ?? new Set())],
    maxTicks: options.maxTicks,
    removeFirstTicks: options.removeFirstTicks,
    metricNames,
    suffix,
  }));
}

/** Executed inside a worker thread; returns the raw (unlabeled) aggregate result. */
export async function runAggregateParseWorkerTask(task: AggregateParseTask): Promise<BenchmarkAggregateRunResult> {
  const result = await parseBenchmarkAggregatesPerRunResultFromCsv(
    task.file,
    task.removeFirstTicks,
    task.maxTicks,
    task.metricNames.map((name) => MetricRegistryInstance.getOrThrow(name)),
    new Set(task.runsToRemove),
  );
  return task.suffix ? { ...result, inputSuffix: task.suffix } : result;
}
