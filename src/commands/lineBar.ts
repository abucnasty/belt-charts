import path from "path";
import { Command } from "commander";
import { aggregationStrategyFromString } from "../data/AggregationStrategy";
import { createLineChartForMetrics } from "../charts/LineChart";
import { computeMaxMetricValueFromCsv, parseBenchmarkAveragePerTickResultFromCsv } from "../data/BenchmarkTickResult";
import { ignoreFirstTicksFromResult } from "../data/tickUtils";
import { MetricEnum } from "../data/MetricEnum";
import { nanoToMicro } from "../utils";
import { LineBarChartOptions } from "./types";
import { addBaseOptions, addAggregateStrategyOption, getBaseName, applyLabel, warnUnmatchedNames, mergeCustomNames, parseNamesFile, loadRunFilters, resolveChartInputs, renderChartToFile, resolveMetrics, addAllowUnfilteredMetricsOption, warnAllowUnfilteredMetrics } from "./utils";

async function generateLineOrBarCharts(
  files: string[],
  runsToRemove: Map<string, Set<number>>,
  options: LineBarChartOptions,
): Promise<void> {
  // Pre-scan for the shared Y-axis max without holding any file's full tick data in memory.
  let maxWholeUpdate = options.maxUpdate;
  if (maxWholeUpdate == null) {
    console.log("--max-update not provided, auto-detecting max value across all files...");
    let rawMax = -Infinity;
    for (const file of files) {
      const baseName = getBaseName(file);
      const fileMax = await computeMaxMetricValueFromCsv(
        file,
        runsToRemove.get(baseName) ?? new Set(),
        MetricEnum.WHOLE_UPDATE.name,
        options.removeFirstTicks,
      );
      if (fileMax > rawMax) {
        rawMax = fileMax;
      }
      console.log(`${baseName}: current max value ${nanoToMicro(rawMax)}`);
    }
    maxWholeUpdate = nanoToMicro(rawMax);
    console.log(`Auto-detected max value: ${maxWholeUpdate}`);
  }

  const fileNameWithoutExt = options.output.replace(/\.[^/.]+$/, "");
  const ext = path.extname(options.output) || ".png";

  for (const file of files) {
    console.log(`Processing file: ${file}`);
    const baseName = getBaseName(file);
    let result = await parseBenchmarkAveragePerTickResultFromCsv(
      file,
      runsToRemove.get(baseName) ?? new Set(),
      options.maxTicks,
    );

    if (options.removeFirstTicks > 0) {
      result = ignoreFirstTicksFromResult(result, options.removeFirstTicks);
    }
    result = applyLabel(result, options.trimPrefix, options.customNames, options.titleCase, options.trimSubstrings);

    const config = createLineChartForMetrics(result, {
      maxTicks: options.maxTicks,
      maxUpdateValue: maxWholeUpdate,
      type: options.type,
      aggregationStrategy: options.aggregateStrategy,
      tickWindow: options.tickWindowAggregation,
      metrics: options.metrics,
    });

    const fileName = `${fileNameWithoutExt}_${baseName}${ext}`;
    await renderChartToFile(config, options.width, options.height, fileName);
  }
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
