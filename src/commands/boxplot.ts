import path from "path";
import { globSync } from "glob";
import { Command } from "commander";
import { Canvas } from "skia-canvas";
import { Chart } from "chart.js";
import fsp from "node:fs/promises";
import { createBoxPlotChartConfiguration } from "../charts/BoxPlot";
import { parseBenchmarkAggregatesPerRunResultFromCsv } from "../data/BenchmarkAggregateResult";
import { ensureOutputDir } from "../utils";
import { BoxPlotChartOptions } from "./types";
import { addBaseOptions, getBaseName, applyTrimPrefix, loadRunFilters } from "./utils";

async function generateBoxPlot(
  files: string[],
  runsToRemove: Map<string, Set<number>>,
  options: BoxPlotChartOptions,
): Promise<void> {
  const aggregateResults = [];

  for (const file of files) {
    console.log(`Processing file: ${file}`);
    const baseName = getBaseName(file);
    const result = await parseBenchmarkAggregatesPerRunResultFromCsv(
      file,
      options.removeFirstTicks,
      options.maxTicks,
      options.metrics,
      runsToRemove.get(baseName) ?? new Set(),
    );
    applyTrimPrefix(result, options.trimPrefix);
    aggregateResults.push(result);
  }

  const config = createBoxPlotChartConfiguration(aggregateResults, {
    minUpdateTime: options.minUpdate,
    maxUpdateTime: options.maxUpdate,
  });

  console.log("Chart configuration created.");
  const canvas = new Canvas(options.width, options.height);
  const chart = new Chart(canvas as any, config);
  const imageBuffer = await canvas.toBuffer("png");

  const outputFile = path.resolve(process.cwd(), options.output);
  await fsp.writeFile(outputFile, imageBuffer);
  console.log(`Box plot chart saved to ${outputFile}`);
  chart.destroy();
}

export function createBoxPlotCommand(): Command {
  return addBaseOptions(
    new Command("boxplot")
      .description("Generate boxplot charts showing distribution statistics"),
  )
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
        aggregateFile: opts.aggregateFile,
        stddevFilter: opts.stddevFilter,
        metrics: opts.metrics,
        minUpdate: opts.minUpdate,
        maxUpdate: opts.maxUpdate,
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

      await generateBoxPlot(files, runsToRemove, options);
    });
}
