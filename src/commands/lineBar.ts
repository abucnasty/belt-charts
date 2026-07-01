import path from "path";
import { Command } from "commander";
import { aggregationStrategyFromString } from "../data/AggregationStrategy";
import { createLineChartForMetrics } from "../charts/LineChart";
import { BenchmarkTickResult, parseBenchmarkAveragePerTickResultFromCsv } from "../data/BenchmarkTickResult";
import { ignoreFirstTicksFromResult } from "../data/tickUtils";
import { MetricEnum } from "../data/MetricEnum";
import { nanoToMicro } from "../utils";
import { LineBarChartOptions } from "./types";
import { addBaseOptions, addAggregateStrategyOption, getBaseName, applyLabel, warnUnmatchedNames, loadRunFilters, resolveChartInputs, renderChartToFile, resolveMetrics } from "./utils";

async function generateLineOrBarCharts(
  files: string[],
  runsToRemove: Map<string, Set<number>>,
  options: LineBarChartOptions,
): Promise<void> {
  const benchmarkResults: Array<{ result: BenchmarkTickResult; baseNameForOutput: string }> = [];

  for (const file of files) {
    console.log(`Processing file: ${file}`);
    const baseName = getBaseName(file);
    let result = await parseBenchmarkAveragePerTickResultFromCsv(
      file,
      runsToRemove.get(baseName) ?? new Set(),
    );

    if (options.removeFirstTicks > 0) {
      result = ignoreFirstTicksFromResult(result, options.removeFirstTicks);
    }
    result = applyLabel(result, options.trimPrefix, options.customNames);
    benchmarkResults.push({ result, baseNameForOutput: baseName });
  }

  const maxWholeUpdate =
    options.maxUpdate ??
    benchmarkResults
      .flatMap((r) =>
        r.result.metricTickStats
          .get(MetricEnum.WHOLE_UPDATE.name)!
          .map((v) => nanoToMicro(v.maximum)),
      )
      .reduce((max, v) => (v > max ? v : max), -Infinity);

  const configurations = benchmarkResults.map(({ result, baseNameForOutput }) => ({
    result,
    baseNameForOutput,
    config: createLineChartForMetrics(result, {
      maxTicks: options.maxTicks,
      maxUpdateValue: maxWholeUpdate,
      type: options.type,
      aggregationStrategy: options.aggregateStrategy,
      tickWindow: options.tickWindowAggregation,
      metrics: options.metrics,
    }),
  }));

  console.log("Chart configurations created.");
  const fileNameWithoutExt = options.output.replace(/\.[^/.]+$/, "");
  const ext = path.extname(options.output) || ".png";

  for (const { baseNameForOutput, config } of configurations) {
    const fileName = `${fileNameWithoutExt}_${baseNameForOutput}${ext}`;
    await renderChartToFile(config, options.width, options.height, fileName);
  }
}

function createLineBarCommand(type: "line" | "bar"): Command {
  const description =
    type === "line"
      ? "Generate line charts showing metrics over time"
      : "Generate bar charts showing metrics over time";

  return addAggregateStrategyOption(
    addBaseOptions(
      new Command(type).description(description),
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
        customNames: opts.name ?? new Map(),
        aggregateFile: opts.aggregateFile,
        stddevFilter: opts.stddevFilter,
        metrics: resolveMetrics(opts.metrics),
        aggregateStrategy: aggregationStrategyFromString(opts.aggregateStrategy),
        tickWindowAggregation: opts.tickWindowAggregation,
        maxUpdate: opts.maxUpdate,
        type,
        minPercent: opts.minPercent,
      };

      const { files, runsToRemove } = await resolveChartInputs(pattern, options);
      warnUnmatchedNames(files, options.customNames);

      await generateLineOrBarCharts(files, runsToRemove, options);
    });
}

export function createLineCommand(): Command {
  return createLineBarCommand("line");
}

export function createBarCommand(): Command {
  return createLineBarCommand("bar");
}
