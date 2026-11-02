import { Command } from "commander";
import { AggregationStrategy, aggregationStrategyFromString } from "../data/AggregationStrategy";
import { createSummaryChartConfiguration, SummaryChartResult } from "../charts/SummaryChart";
import { type BenchmarkAggregateRunResult } from "../data/BenchmarkAggregateResult";
import { SummaryChartOptions } from "./types";
import { baseOptions, applyLabel, assignToGroup, warnUnmatchedNames, warnUnmatchedGroups, resolveChartInputs, renderChartToFile, resolveMetrics, allowUnfilteredMetricsOption, warnAllowUnfilteredMetrics, animationOptions, validateAnimateOutput, staggerOption, valueLabelsOption, commonOptionsFrom, sortOption, baselineOptions, errorBarsOption, pairedOption, validateBaselineOptions, type ChartInput } from "./utils";
import { CommandBuilder } from "./commandBuilder";
import { renderChartAnimationToFile } from "./videoEncoder";
import { scaleCategoricalForAnimation } from "../charts/animation";
import { runInWorkerPool } from "./workerPool";
import { AggregateParseTask, buildAggregateParseTasks } from "./aggregateParseWorkerTask";

async function generateSummary(
  inputs: ChartInput[],
  runsToRemove: Map<string, Set<number>>,
  options: SummaryChartOptions,
): Promise<void> {
  const tasks = buildAggregateParseTasks(inputs, runsToRemove, options, options.metrics.map((m) => m.name));

  const aggregateResults: BenchmarkAggregateRunResult[] = new Array(inputs.length);
  await runInWorkerPool<AggregateParseTask, BenchmarkAggregateRunResult>(tasks, {
    onTaskComplete: (task, rawResult) => {
      // Group matching runs against the raw source filename (originalFileName). This ensures group
      // keys still match even when the same substrings appear in --trim-substring or --title-case
      // would otherwise mutate them.
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
    // Animations don't export the table CSV/MD files.
    csvTableExportName: options.summaryTableFile && !options.animate
      ? options.output.replace(/\.[^/.]+$/, "")
      : undefined,
    titleOverride: options.titleOverride ?? undefined,
    subtitle: options.subtitle,
    minPercent: options.minPercent,
    maxUpdate: options.maxUpdate,
    groupBy: options.groupBy,
    allowUnfilteredMetrics: options.allowUnfilteredMetrics,
    valueLabels: options.valueLabels,
    sort: options.sort,
    baseline: options.baseline,
    baselinePerGroup: options.baselinePerGroup,
    errorBars: options.errorBars,
    paired: options.paired,
  });

  console.log("Chart configuration created.");
  const width = Math.max(options.width, recommendedWidth);
  const height = Math.max(options.height, recommendedHeight);
  if (options.animate) {
    await renderChartAnimationToFile(
      (progress) => scaleCategoricalForAnimation(config, progress, options.stagger),
      width, height, options.output,
      { durationSeconds: options.duration, fps: options.fps, easing: options.easing, holdSeconds: options.hold, scale: options.scale },
    );
  } else {
    await renderChartToFile(config, width, height, options.output, options.scale);
  }
  await exportTable?.();
}

export function createSummaryCommand(): Command {
  return CommandBuilder
    .command("summary")
    .setDescription("Generate a summary chart with aggregate statistics table")
    .addOption(baseOptions)
    .addOption(allowUnfilteredMetricsOption)
    .addOption(animationOptions)
    .addOption(staggerOption)
    .addOption(valueLabelsOption)
    .addOption(sortOption)
    .addOption(baselineOptions)
    .addOption(errorBarsOption)
    .addOption(pairedOption)
    .build()
    .option<boolean>(
      "--summary-table <boolean>",
      "Create a verbose summary stats table in summary chart (default true)",
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
    .option<number | null>(
      "--max-update <number>",
      "Set the maximum x-axis value (microseconds)",
      (it: string) => parseFloat(it),
      null,
    )
    .action(async (pattern, opts) => {
      const options: SummaryChartOptions = {
        width: opts.width,
        height: opts.height,
        scale: opts.scale,
        output: opts.output,
        ...commonOptionsFrom(opts),
        removeFirstTicks: opts.removeFirstTicks,
        maxTicks: opts.maxTicks,
        trimPrefix: opts.trimPrefix,
        trimSubstrings: opts.trimSubstring ?? [],
        customNames: opts.name ?? new Map(),
        namesFile: opts.namesFile ?? "",
        aggregateFile: opts.aggregateFile,
        stddevFilter: opts.stddevFilter,
        metrics: resolveMetrics(opts.metrics),
        aggregateStrategy: opts.aggregateStrategy,
        summaryTable: opts.summaryTable,
        summaryTableFile: opts.summaryTableFile,
        titleOverride: opts.titleOverride,
        minPercent: opts.minPercent,
        titleCase: opts.titleCase,
        maxUpdate: opts.maxUpdate,
        groupBy: opts.groupBy ?? [],
        allowUnfilteredMetrics: opts.allowUnfilteredMetrics ?? false,
        animate: opts.animate ?? false,
        duration: opts.duration,
        fps: opts.fps,
        easing: opts.easing,
        hold: opts.hold,
        stagger: opts.stagger ?? false,
        valueLabels: opts.valueLabels ?? false,
        sort: opts.sort,
        baseline: opts.baseline,
        baselinePerGroup: opts.baselinePerGroup,
        errorBars: opts.errorBars,
        paired: opts.paired ?? false,
      };

      validateAnimateOutput(options.output, options.animate);
      validateBaselineOptions(options);
      const { files, inputs, runsToRemove } = await resolveChartInputs(pattern, options);
      warnUnmatchedNames(files, options.customNames);
      warnUnmatchedGroups(files, options.groupBy);
      warnAllowUnfilteredMetrics(options.allowUnfilteredMetrics);

      await generateSummary(inputs, runsToRemove, options);
    });
}
