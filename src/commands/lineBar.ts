import path from "path";
import { Command } from "commander";
import { aggregationStrategyFromString } from "../data/AggregationStrategy";
import { createLineChartForMetrics } from "../charts/LineChart";
import type { BenchmarkTickResult } from "../data/BenchmarkTickResult";
import { nanoToMicro } from "../utils";
import { LineBarChartOptions } from "./types";
import { addBaseOptions, addAggregateStrategyOption, getBaseName, warnUnmatchedNames, mergeCustomNames, parseNamesFile, loadRunFilters, resolveChartInputs, renderChartToFile, resolveMetrics, addAllowUnfilteredMetricsOption, warnAllowUnfilteredMetrics } from "./utils";
import { runInWorkerPool } from "./workerPool";
import { LineBarParseTask, LineBarScanTask } from "./lineBarWorkerTask";

async function generateLineOrBarCharts(
  files: string[],
  runsToRemove: Map<string, Set<number>>,
  options: LineBarChartOptions,
): Promise<void> {
  // Pre-scan for the shared Y-axis max without holding any file's full tick data in memory.
  let maxWholeUpdate = options.maxUpdate;
  if (maxWholeUpdate == null) {
    console.log("--max-update not provided, auto-detecting max value across all files...");
    const scanTasks: LineBarScanTask[] = files.map((file) => ({
      taskType: "lineBarScan",
      file,
      runsToRemove: [...(runsToRemove.get(getBaseName(file)) ?? new Set())],
      removeFirstTicks: options.removeFirstTicks,
    }));

    let rawMax = -Infinity;
    await runInWorkerPool<LineBarScanTask, number>(scanTasks, {
      onTaskComplete: (task, fileMax) => {
        if (fileMax > rawMax) {
          rawMax = fileMax;
        }
        console.log(`${getBaseName(task.file)}: max value ${nanoToMicro(fileMax)} (running max ${nanoToMicro(rawMax)})`);
      },
    });
    maxWholeUpdate = nanoToMicro(rawMax);
    console.log(`Auto-detected max value: ${maxWholeUpdate}`);
  }

  const fileNameWithoutExt = options.output.replace(/\.[^/.]+$/, "");
  const ext = path.extname(options.output) || ".png";
  const maxUpdateValue = maxWholeUpdate;

  const parseTasks: LineBarParseTask[] = files.map((file) => ({
    taskType: "lineBarParse",
    file,
    runsToRemove: [...(runsToRemove.get(getBaseName(file)) ?? new Set())],
    maxTicks: options.maxTicks,
    removeFirstTicks: options.removeFirstTicks,
    metricNames: options.metrics.map((m) => m.name),
    trimPrefix: options.trimPrefix,
    customNames: [...options.customNames],
    titleCase: options.titleCase,
    trimSubstrings: options.trimSubstrings,
  }));

  // Parsing runs across the worker pool (parallel, safe), but chart rendering (skia-canvas)
  // stays single-threaded on the main thread: concurrent skia-canvas rendering across worker
  // threads caused intermittent native crashes. Renders are chained so each still overlaps
  // with the next file's parsing instead of waiting for every file to finish parsing first.
  // onTaskComplete is awaited by the pool before dispatching more parse work, so parsing can't
  // race arbitrarily far ahead of rendering and pile up every file's parsed data in memory.
  let renderChain: Promise<void> = Promise.resolve();
  const renderOne = (result: BenchmarkTickResult): Promise<void> => {
    const config = createLineChartForMetrics(result, {
      maxTicks: options.maxTicks,
      maxUpdateValue,
      type: options.type,
      aggregationStrategy: options.aggregateStrategy,
      tickWindow: options.tickWindowAggregation,
      metrics: options.metrics,
    });
    const outputPath = `${fileNameWithoutExt}_${result.originalFileName}${ext}`;
    return renderChartToFile(config, options.width, options.height, outputPath);
  };

  await runInWorkerPool<LineBarParseTask, BenchmarkTickResult>(parseTasks, {
    onTaskComplete: (_task, result) => {
      renderChain = renderChain.then(() => renderOne(result));
      return renderChain;
    },
  });
  await renderChain;

  // Exit immediately rather than letting Node drain the event loop naturally: tearing down
  // many worker threads after native addon (skia-canvas) usage can segfault on process exit.
  process.exit(0);
}




function createLineBarCommand(type: "line" | "bar"): Command {
  const description =
    type === "line"
      ? "Generate line charts showing metrics over time"
      : "Generate bar charts showing metrics over time";

  return addAggregateStrategyOption(
    addAllowUnfilteredMetricsOption(
      addBaseOptions(
        new Command(type).description(description),
      ),
    ),
  )
    .option(
      "--tick-window-aggregation <number>",
      "Take the time weighted average for the tick window specified",
      (it: string) => Number(it),
      0,
    )
    .option(
      "--max-update <number>",
      "Max ms value to plot (auto-detect if not specified)",
      (it: string) => Number(it),
      null,
    )
    .action(async (pattern, opts) => {
      const options: LineBarChartOptions = {
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
        aggregateStrategy: aggregationStrategyFromString(opts.aggregateStrategy),
        tickWindowAggregation: opts.tickWindowAggregation,
        maxUpdate: opts.maxUpdate,
        type,
        minPercent: opts.minPercent,
        titleCase: opts.titleCase,
        groupBy: opts.groupBy ?? [],
        titleOverride: opts.titleOverride,
        allowUnfilteredMetrics: opts.allowUnfilteredMetrics ?? false,
      };

      const { files, runsToRemove } = await resolveChartInputs(pattern, options);
      if (options.namesFile) {
        options.customNames = mergeCustomNames(parseNamesFile(options.namesFile), options.customNames);
      }
      warnUnmatchedNames(files, options.customNames);
      warnAllowUnfilteredMetrics(options.allowUnfilteredMetrics);

      await generateLineOrBarCharts(files, runsToRemove, options);
    });
}

export function createLineCommand(): Command {
  return createLineBarCommand("line");
}

export function createBarCommand(): Command {
  return createLineBarCommand("bar");
}
