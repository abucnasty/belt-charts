import { Command } from "commander";
import { AggregationStrategy, aggregationStrategyFromString } from "../data/AggregationStrategy";
import { createSummaryChartConfiguration } from "../charts/SummaryChart";
import {
  type BenchmarkAggregateRunResult,
  explodeIntoPerRunResults,
  SingleRunAggregateResult,
} from "../data/BenchmarkAggregateResult";
import { MetricEnum } from "../data/MetricEnum";
import { SummaryPerRunChartOptions } from "./types";
import { addBaseOptions, getBaseName, applyLabel, warnUnmatchedNames, mergeCustomNames, parseNamesFile, resolveChartInputs, renderChartToFile, addAnimationOptions, validateAnimateOutput } from "./utils";
import { renderChartAnimationToFile } from "./videoEncoder";
import { scaleCategoricalForAnimation } from "../charts/animation";
import { runInWorkerPool } from "./workerPool";
import { AggregateParseTask } from "./aggregateParseWorkerTask";

async function generateUpsPerRun(
  files: string[],
  runsToRemove: Map<string, Set<number>>,
  options: SummaryPerRunChartOptions,
): Promise<void> {
  const tasks: AggregateParseTask[] = files.map((file, fileIndex) => ({
    taskType: "aggregateParse",
    file,
    fileIndex,
    runsToRemove: [...(runsToRemove.get(getBaseName(file)) ?? new Set())],
    maxTicks: options.maxTicks,
    removeFirstTicks: options.removeFirstTicks,
    metricNames: options.metrics.map((m) => m.name),
  }));

  const perFileResults: SingleRunAggregateResult[][] = new Array(files.length);
  await runInWorkerPool<AggregateParseTask, BenchmarkAggregateRunResult>(tasks, {
    onTaskComplete: (task, rawResult) => {
      const result = applyLabel(
        rawResult,
        options.trimPrefix,
        options.customNames,
        options.titleCase,
        options.trimSubstrings,
      );
      perFileResults[task.fileIndex] = explodeIntoPerRunResults(result, options.aggregateStrategy);
    },
  });
  const allPerRunResults: SingleRunAggregateResult[] = perFileResults.flat();

  if (options.sortBy === "run") {
    // Sort by displayName then run number (extract run number from "displayName (run N)")
    allPerRunResults.sort((a, b) => {
      const aMatch = a.displayName.match(/^(.+) \(run (\d+)\)$/);
      const bMatch = b.displayName.match(/^(.+) \(run (\d+)\)$/);

      if (!aMatch || !bMatch) {
        return a.displayName.localeCompare(b.displayName);
      }

      const aBase = aMatch[1];
      const bBase = bMatch[1];
      const aRun = parseInt(aMatch[2]);
      const bRun = parseInt(bMatch[2]);

      const baseCompare = aBase.localeCompare(bBase);
      if (baseCompare !== 0) return baseCompare;

      return aRun - bRun;
    });
  }

  const { config, exportTable, recommendedHeight, recommendedWidth } = createSummaryChartConfiguration(allPerRunResults, {
    metrics: options.metrics,
    includeTable: options.summaryTable,
    aggregationStrategy: options.aggregateStrategy,
    csvTableExportName: options.summaryTableFile
      ? options.output.replace(/\.[^/.]+$/, "")
      : undefined,
    titleOverride: options.titleOverride ?? undefined,
    sortBy: options.sortBy === "run" ? "preserve" : "total",
    isPerRun: true,
    valueMode: "ups",
  });

  console.log("Chart configuration created.");
  const width = Math.max(options.width, recommendedWidth);
  const height = Math.max(options.height, recommendedHeight);
  if (options.animate) {
    await renderChartAnimationToFile(
      (progress) => scaleCategoricalForAnimation(config, progress),
      width, height, options.output,
      { durationSeconds: options.duration, fps: options.fps, easing: options.easing },
    );
  } else {
    await renderChartToFile(config, width, height, options.output);
  }
  await exportTable?.();
}

export function createUpsPerRunCommand(): Command {
  return addAnimationOptions(addBaseOptions(
    new Command("ups-per-run")
      .description("Generate a chart showing updates per second (UPS) for each individual run (not averaged across runs)"),
  ))
    .option<boolean>(
      "--summary-table <boolean>",
      "Create a verbose summary stats table in the chart (default true)",
      (it) => it.toLowerCase() == "true",
      true,
    )
    .option<boolean>(
      "--summary-table-file <boolean>",
      "Export as csv and markdown (default true)",
      (it) => it.toLowerCase() == "true",
      true,
    )
    .option<AggregationStrategy>(
      "-a, --aggregate-strategy <average | minimum | maximum | median | standard_deviation>",
      "Which per-run statistic to display (average of ticks in that run, median, etc.)",
      (it: string) => aggregationStrategyFromString(it),
      AggregationStrategy.AVERAGE,
    )
    .option<"run" | "total">(
      "--sort-by <run | total>",
      "Sort bars by run number (preserving file order) or by UPS (default: total)",
      (it: string) => {
        if (it === "run" || it === "total") {
          return it;
        }
        console.error(`Invalid sort-by value: ${it}. Must be "run" or "total". Defaulting to "total".`);
        return "total";
      },
      "total",
    )
    .action(async (pattern, opts) => {
      const options: SummaryPerRunChartOptions = {
        width: opts.width,
        height: opts.height,
        output: opts.output,
        removeFirstTicks: opts.removeFirstTicks,
        maxTicks: opts.maxTicks,
        trimPrefix: opts.trimPrefix,
        trimSubstrings: opts.trimSubstring ?? [],
        customNames: opts.name ?? new Map(),
        namesFile: opts.namesFile ?? "",
        aggregateFile: opts.aggregateFile,
        stddevFilter: opts.stddevFilter,
        metrics: [MetricEnum.WHOLE_UPDATE],
        aggregateStrategy: opts.aggregateStrategy,
        summaryTable: opts.summaryTable,
        summaryTableFile: opts.summaryTableFile,
        titleOverride: opts.titleOverride,
        sortBy: opts.sortBy,
        minPercent: 0,
        titleCase: opts.titleCase,
        maxUpdate: null,
        groupBy: opts.groupBy ?? [],
        allowUnfilteredMetrics: false,
        animate: opts.animate ?? false,
        duration: opts.duration,
        fps: opts.fps,
        easing: opts.easing,
      };

      validateAnimateOutput(options.output, options.animate);
      const { files, runsToRemove } = await resolveChartInputs(pattern, options);
      if (options.namesFile) {
        options.customNames = mergeCustomNames(parseNamesFile(options.namesFile), options.customNames);
      }
      warnUnmatchedNames(files, options.customNames);

      await generateUpsPerRun(files, runsToRemove, options);
    });
}
