import { Command } from "commander";
import { createBoxPlotChartConfiguration } from "../charts/BoxPlot";
import { type BenchmarkAggregateRunResult } from "../data/BenchmarkAggregateResult";
import { BoxPlotChartOptions } from "./types";
import { baseOptions, applyLabel, warnUnmatchedNames, resolveChartInputs, renderChartToFile, resolveMetrics, animationOptions, validateAnimateOutput, commonOptionsFrom, sortOption, type ChartInput } from "./utils";
import { CommandBuilder } from "./commandBuilder";
import { renderChartAnimationToFile } from "./videoEncoder";
import { scaleBoxplotForAnimation } from "../charts/animation";
import { runInWorkerPool } from "./workerPool";
import { AggregateParseTask, buildAggregateParseTasks } from "./aggregateParseWorkerTask";

async function generateBoxPlot(
  inputs: ChartInput[],
  runsToRemove: Map<string, Set<number>>,
  options: BoxPlotChartOptions,
): Promise<void> {
  const tasks = buildAggregateParseTasks(inputs, runsToRemove, options, options.metrics.map((m) => m.name));

  const aggregateResults: BenchmarkAggregateRunResult[] = new Array(inputs.length);
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
    subtitle: options.subtitle,
    sort: options.sort,
  });

  console.log("Chart configuration created.");
  const width = Math.max(options.width, recommendedWidth);
  if (options.animate) {
    await renderChartAnimationToFile(
      (progress) => scaleBoxplotForAnimation(config, progress),
      width, options.height, options.output,
      { durationSeconds: options.duration, fps: options.fps, easing: options.easing, holdSeconds: options.hold, scale: options.scale },
    );
  } else {
    await renderChartToFile(config, width, options.height, options.output, options.scale);
  }
}

export function createBoxPlotCommand(): Command {
  return CommandBuilder
    .command("boxplot")
    .setDescription("Generate boxplot charts showing distribution statistics")
    .addOption(baseOptions)
    .addOption(animationOptions)
    .addOption(sortOption)
    .build()
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
        hold: opts.hold,
        sort: opts.sort,
      };

      validateAnimateOutput(options.output, options.animate);
      const { files, inputs, runsToRemove } = await resolveChartInputs(pattern, options);
      warnUnmatchedNames(files, options.customNames);

      await generateBoxPlot(inputs, runsToRemove, options);
    });
}
