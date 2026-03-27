import path from "path";
import { globSync } from "glob";
import { Command } from "commander";
import { Canvas } from "skia-canvas";
import { Chart } from "chart.js";
import fsp from "node:fs/promises";
import { aggregationStrategyFromString } from "../data/AggregationStrategy";
import { createLineChartForMetrics } from "../charts/LineChart";
import { parseBenchmarkAveragePerTickResultFromCsv } from "../data/BenchmarkTickResult";
import { ignoreFirstTicksFromResult } from "../data/BenchmarkAggregates";
import { MetricEnum } from "../data/MetricEnum";
import { nanoToMicro, ensureOutputDir } from "../utils";
import { LineBarChartOptions } from "./types";
import { addBaseOptions, addAggregateStrategyOption, getBaseName, applyTrimPrefix, loadRunFilters } from "./utils";

async function generateLineOrBarCharts(
  files: string[],
  runsToRemove: Map<string, Set<number>>,
  options: LineBarChartOptions,
): Promise<void> {
  const benchmarkResults = [];

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
    applyTrimPrefix(result, options.trimPrefix);
    benchmarkResults.push(result);
  }

  const maxWholeUpdate =
    options.maxUpdate ??
    benchmarkResults
      .flatMap((r) =>
        r.metricTickStats
          .get(MetricEnum.WHOLE_UPDATE.name)!
          .map((v) => nanoToMicro(v.maximum)),
      )
      .reduce((max, v) => (v > max ? v : max), -Infinity);

  const configurations = benchmarkResults.map((result) => ({
    result,
    config: createLineChartForMetrics(result, {
      maxTicks: options.maxTicks,
      maxUpdateValue: maxWholeUpdate,
      type: options.type,
      aggregationStrategy: options.aggregateStrategy,
      tickWindow: options.tickWindowAggregation,
    }),
  }));

  console.log("Chart configurations created.");
  const fileNameWithoutExt = options.output.replace(/\.[^/.]+$/, "");

  for (const { result, config } of configurations) {
    const canvas = new Canvas(options.width, options.height);
    const chart = new Chart(canvas as any, config);
    const imageBuffer = await canvas.toBuffer("png");
    const fileName = `${fileNameWithoutExt}_${result.fileName}.png`;

    await fsp.writeFile(fileName, imageBuffer);
    chart.destroy();
    console.log(`Metric Line Chart Generated for ${fileName}`);
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
        aggregateFile: opts.aggregateFile,
        stddevFilter: opts.stddevFilter,
        metrics: opts.metrics,
        aggregateStrategy: aggregationStrategyFromString(opts.aggregateStrategy),
        tickWindowAggregation: opts.tickWindowAggregation,
        maxUpdate: opts.maxUpdate,
        type,
      };

      const files = globSync(pattern);
      if (files.length === 0) {
        console.error(`No files matched the given pattern ${pattern}`);
        process.exit(1);
      }

      const runsToRemove = await loadRunFilters(
        options.aggregateFile,
        options.stddevFilter,
      );
      ensureOutputDir(path.resolve(process.cwd(), options.output));

      await generateLineOrBarCharts(files, runsToRemove, options);
    });
}

export function createLineCommand(): Command {
  return createLineBarCommand("line");
}

export function createBarCommand(): Command {
  return createLineBarCommand("bar");
}
