import { computeMaxMetricValueFromCsv, parseBenchmarkAveragePerTickResultFromCsv, type BenchmarkTickResult } from "../data/BenchmarkTickResult";
import { ignoreFirstTicksFromResult } from "../data/tickUtils";
import { MetricEnum } from "../data/MetricEnum";
import type { MetricName } from "../data/Metric";
import { applyLabel } from "./utils";

export type LineBarScanTask = {
  taskType: "lineBarScan";
  file: string;
  runsToRemove: number[];
  removeFirstTicks: number;
};

export type LineBarParseTask = {
  taskType: "lineBarParse";
  file: string;
  runsToRemove: number[];
  maxTicks: number;
  removeFirstTicks: number;
  metricNames: MetricName[];
  trimPrefix: string;
  customNames: [string, string][];
  titleCase: boolean;
  trimSubstrings: string[];
};

export type LineBarWorkerTask = LineBarScanTask | LineBarParseTask;

// Rendering (skia-canvas + chart.js) intentionally stays on the main thread, not here:
// concurrent skia-canvas rendering across worker threads caused intermittent native crashes.

/** Executed inside a worker thread; dispatches on `taskType` and returns the task's result. */
export async function runLineBarWorkerTask(task: LineBarWorkerTask): Promise<number | BenchmarkTickResult> {
  if (task.taskType === "lineBarScan") {
    return computeMaxMetricValueFromCsv(
      task.file,
      new Set(task.runsToRemove),
      MetricEnum.WHOLE_UPDATE.name,
      task.removeFirstTicks,
    );
  }

  let result = await parseBenchmarkAveragePerTickResultFromCsv(
    task.file,
    new Set(task.runsToRemove),
    task.maxTicks,
    new Set(task.metricNames),
  );
  if (task.removeFirstTicks > 0) {
    result = ignoreFirstTicksFromResult(result, task.removeFirstTicks);
  }
  return applyLabel(result, task.trimPrefix, new Map(task.customNames), task.titleCase, task.trimSubstrings);
}
