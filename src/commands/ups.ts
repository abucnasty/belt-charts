import { Command } from "commander";
import { AggregationStrategy, aggregationStrategyFromString } from "../data/AggregationStrategy";
import { createSummaryChartConfiguration } from "../charts/SummaryChart";
import { type BenchmarkAggregateRunResult } from "../data/BenchmarkAggregateResult";
import { MetricEnum } from "../data/MetricEnum";
import { SummaryChartOptions } from "./types";
import { addBaseOptions, getBaseName, applyLabel, assignToGroup, warnUnmatchedNames, mergeCustomNames, parseNamesFile, loadRunFilters, resolveChartInputs, renderChartToFile } from "./utils";
import { runInWorkerPool } from "./workerPool";
import { AggregateParseTask } from "./aggregateParseWorkerTask";

async function generateUps(
  files: string[],
  runsToRemove: Map<string, Set<number>>,
  options: SummaryChartOptions,
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
    onTaskComplete: (task, rawResult) => {
      const group = options.groupBy.length > 0 ? assignToGroup(rawResult.originalFileName, options.groupBy) : null;
      const rawWithGroup = group !== null ? { ...rawResult, group } : rawResult;
      aggregateResults[task.fileIndex] = applyLabel(
        rawWithGroup,
        options.trimPrefix,
        options.customNames,
        options.titleCase,
        options.trimSubstrings,
      );
    },
  });

  const { config, exportTable, recommendedHeight, recommendedWidth } = createSummaryChartConfiguration(aggregateResults, {
    metrics: options.metrics,
    includeTable: options.summaryTable,
    aggregationStrategy: options.aggregateStrategy,
    csvTableExportName: options.summaryTableFile
      ? options.output.replace(/\.[^/.]+$/, "")
      : undefined,
    titleOverride: options.titleOverride ?? undefined,
    groupBy: options.groupBy,
    valueMode: "ups",
  });

  console.log("Chart configuration created.");
  await renderChartToFile(config, Math.max(options.width, recommendedWidth), Math.max(options.height, recommendedHeight), options.output);
  await exportTable?.();
}

export function createUpsCommand(): Command {
  return addBaseOptions(
    new Command("ups")
      .description("Generate a chart showing updates per second (UPS), derived from wholeUpdate, similar to the summary chart"),
  )
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
      "Aggregate the runs by either minimum per tick or average per tick",
      (it: string) => aggregationStrategyFromString(it),
      AggregationStrategy.AVERAGE,
    )
    .action(async (pattern, opts) => {
      const options: SummaryChartOptions = {
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
        minPercent: 0,
        titleCase: opts.titleCase,
        maxUpdate: null,
        groupBy: opts.groupBy ?? [],
        allowUnfilteredMetrics: false,
      };

      const { files, runsToRemove } = await resolveChartInputs(pattern, options);
      if (options.namesFile) {
        options.customNames = mergeCustomNames(parseNamesFile(options.namesFile), options.customNames);
      }
      warnUnmatchedNames(files, options.customNames);

      await generateUps(files, runsToRemove, options);
    });
}
