import { Command } from "commander";
import { AggregationStrategy, aggregationStrategyFromString } from "../data/AggregationStrategy";
import { createSummaryChartConfiguration, SummaryChartResult } from "../charts/SummaryChart";
import {
  parseBenchmarkAggregatesPerRunResultFromCsv,
  explodeIntoPerRunResults,
  SingleRunAggregateResult,
} from "../data/BenchmarkAggregateResult";
import { SummaryPerRunChartOptions } from "./types";
import { addBaseOptions, getBaseName, applyTrimPrefix, loadRunFilters, resolveChartInputs, renderChartToFile } from "./utils";

async function generateSummaryPerRun(
  files: string[],
  runsToRemove: Map<string, Set<number>>,
  options: SummaryPerRunChartOptions,
): Promise<void> {
  const allPerRunResults: SingleRunAggregateResult[] = [];

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
    
    // Explode into per-run results
    const perRunResults = explodeIntoPerRunResults(result, options.aggregateStrategy);
    allPerRunResults.push(...perRunResults);
  }

  // Sort if necessary
  if (options.sortBy === "run") {
    // Sort by fileName then run number (extract run number from "fileName run N")
    allPerRunResults.sort((a, b) => {
      const aMatch = a.fileName.match(/^(.+) run (\d+)$/);
      const bMatch = b.fileName.match(/^(.+) run (\d+)$/);
      
      if (!aMatch || !bMatch) {
        return a.fileName.localeCompare(b.fileName);
      }
      
      const aBase = aMatch[1];
      const bBase = bMatch[1];
      const aRun = parseInt(aMatch[2]);
      const bRun = parseInt(bMatch[2]);
      
      // First compare base file names
      const baseCompare = aBase.localeCompare(bBase);
      if (baseCompare !== 0) return baseCompare;
      
      // Then compare run numbers
      return aRun - bRun;
    });
  }

  const { config, exportTable } = createSummaryChartConfiguration(allPerRunResults, {
    metrics: options.metrics,
    includeTable: options.summaryTable,
    aggregationStrategy: options.aggregateStrategy,
    csvTableExportName: options.summaryTableFile
      ? options.output.replace(/\.[^/.]+$/, "")
      : undefined,
    titleOverride: options.titleOverride ?? undefined,
    sortBy: options.sortBy === "run" ? "preserve" : "total",
    isPerRun: true,
  });

  console.log("Chart configuration created.");
  await renderChartToFile(config, options.width, options.height, options.output);
  await exportTable?.();
}

export function createSummaryPerRunCommand(): Command {
  return addBaseOptions(
    new Command("summary-per-run")
      .description("Generate a summary chart showing metrics for each individual run (not averaged across runs)"),
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
      "Which per-run statistic to display (average of ticks in that run, median, etc.)",
      (it: string) => aggregationStrategyFromString(it),
      AggregationStrategy.AVERAGE,
    )
    .option<string | null>(
      "--title-override <string>",
      "Override the title of the chart",
      (it: string) => it,
      null,
    )
    .option<"run" | "total">(
      "--sort-by <run | total>",
      "Sort bars by run number (preserving file order) or by total wholeUpdate time (default: total)",
      (it: string) => {
        if (it === "run" || it === "total") {
          return it;
        }
        console.error(`Invalid sort-by value: ${it}. Must be "run" or "total". Defaulting to "total".`);
        return "total";
      },
      "total",
    )
    .action(async (pattern, opts) => {
      const options: SummaryPerRunChartOptions = {
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
        sortBy: opts.sortBy,
      };

      const { files, runsToRemove } = await resolveChartInputs(pattern, options);

      await generateSummaryPerRun(files, runsToRemove, options);
    });
}
