import { Command } from "commander";
import { createBoxPlotChartConfiguration } from "../charts/BoxPlot";
import { type BenchmarkAggregateRunResult } from "../data/BenchmarkAggregateResult";
import { BoxPlotChartOptions } from "./types";
import { addBaseOptions, getBaseName, applyLabel, warnUnmatchedNames, mergeCustomNames, parseNamesFile, loadRunFilters, resolveChartInputs, renderChartToFile, resolveMetrics, addAnimationOptions, validateAnimateOutput } from "./utils";
import { renderChartAnimationToFile } from "./videoEncoder";
import { scaleBoxplotForAnimation } from "../charts/animation";
import { runInWorkerPool } from "./workerPool";
import { AggregateParseTask } from "./aggregateParseWorkerTask";

async function generateBoxPlot(
  files: string[],
  runsToRemove: Map<string, Set<number>>,
  options: BoxPlotChartOptions,
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

  const aggregateResults: BenchmarkAggregateRunResult[] = new Array(files.length);
  await runInWorkerPool<AggregateParseTask, BenchmarkAggregateRunResult>(tasks, {
    onTaskComplete: (task, result) => {
      aggregateResults[task.fileIndex] = applyLabel(
        result,
        options.trimPrefix,
        options.customNames,
        options.titleCase,
        options.trimSubstrings,
      );
    },
  });

  const { config, recommendedWidth } = createBoxPlotChartConfiguration(aggregateResults, {
    minUpdateTime: options.minUpdate,
    maxUpdateTime: options.maxUpdate,
    titleOverride: options.titleOverride ?? undefined,
  });

  console.log("Chart configuration created.");
  const width = Math.max(options.width, recommendedWidth);
  if (options.animate) {
    await renderChartAnimationToFile(
      (progress) => scaleBoxplotForAnimation(config, progress),
      width, options.height, options.output,
      { durationSeconds: options.duration, fps: options.fps, easing: options.easing },
    );
  } else {
    await renderChartToFile(config, width, options.height, options.output);
  }
}

export function createBoxPlotCommand(): Command {
  return addAnimationOptions(addBaseOptions(
    new Command("boxplot")
      .description("Generate boxplot charts showing distribution statistics"),
  ))
    .option(
      "--min-update <number>",
      "Min ms value to plot",
      (it: string) => Number(it),
      null,
    )
    .option(
      "--max-update <number>",
      "Max ms value to plot",
      (it: string) => Number(it),
      null,
    )
    .action(async (pattern, opts) => {
      const options: BoxPlotChartOptions = {
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
        metrics: resolveMetrics(opts.metrics),
        minUpdate: opts.minUpdate,
        maxUpdate: opts.maxUpdate,
        minPercent: opts.minPercent,
        titleCase: opts.titleCase,
        groupBy: opts.groupBy ?? [],
        titleOverride: opts.titleOverride,
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

      await generateBoxPlot(files, runsToRemove, options);
    });
}
