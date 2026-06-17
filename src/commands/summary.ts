import path from "path";
import { globSync } from "glob";
import { Command } from "commander";
import { Canvas } from "skia-canvas";
import { Chart } from "chart.js";
import fsp from "node:fs/promises";
import { AggregationStrategy, aggregationStrategyFromString } from "../data/AggregationStrategy";
import { createSummaryChartConfiguration, SummaryChartResult } from "../charts/SummaryChart";
import { parseBenchmarkAggregatesPerRunResultFromCsv } from "../data/BenchmarkAggregateResult";
import { ensureOutputDir } from "../utils";
import { SummaryChartOptions } from "./types";
import { addBaseOptions, getBaseName, applyTrimPrefix, loadRunFilters } from "./utils";

async function generateSummary(
  files: string[],
  runsToRemove: Map<string, Set<number>>,
  options: SummaryChartOptions,
): Promise<void> {
  const aggregateResults = [];

  for (const file of files) {
    console.log(`Processing file: ${file}`);
    const baseName = getBaseName(file);
    const result = applyTrimPrefix(
      await parseBenchmarkAggregatesPerRunResultFromCsv(
        file,
        options.removeFirstTicks,
        options.maxTicks,
        options.metrics,
        runsToRemove.get(baseName) ?? new Set(),
      ),
      options.trimPrefix,
    );
    aggregateResults.push(result);
  }

  const { config, exportTable } = createSummaryChartConfiguration(aggregateResults, {
    metrics: options.metrics,
    includeTable: options.summaryTable,
    aggregationStrategy: options.aggregateStrategy,
    csvTableExportName: options.summaryTableFile
      ? options.output.replace(/\.[^/.]+$/, "")
      : undefined,
    titleOverride: options.titleOverride ?? undefined,
  });

  console.log("Chart configuration created.");
  const canvas = new Canvas(options.width, options.height);
  const chart = new Chart(canvas as any, config);
  const imageBuffer = await canvas.toBuffer("png");

  const outputFile = path.resolve(process.cwd(), options.output);
  await fsp.writeFile(outputFile, imageBuffer);
  await exportTable?.();
  console.log(`Summary chart with table saved to ${outputFile}`);
  chart.destroy();
}

export function createSummaryCommand(): Command {
  return addBaseOptions(
    new Command("summary")
      .description("Generate a summary chart with aggregate statistics table"),
  )
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
    .option<string | null>(
      "--title-override <string>",
      "Override the title of the chart",
      (it: string) => it,
      null,
    )
    .action(async (pattern, opts) => {
      const options: SummaryChartOptions = {
        width: opts.width,
        height: opts.height,
        output: opts.output,
        removeFirstTicks: opts.removeFirstTicks,
        maxTicks: opts.maxTicks,
        trimPrefix: opts.trimPrefix,
        aggregateFile: opts.aggregateFile,
        stddevFilter: opts.stddevFilter,
        metrics: opts.metrics,
        aggregateStrategy: opts.aggregateStrategy,
        summaryTable: opts.summaryTable,
        summaryTableFile: opts.summaryTableFile,
        titleOverride: opts.titleOverride,
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

      await generateSummary(files, runsToRemove, options);
    });
}
