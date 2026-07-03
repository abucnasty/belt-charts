import { Command } from "commander";
import { AggregationStrategy, aggregationStrategyFromString } from "../data/AggregationStrategy";
import { createSummaryChartConfiguration, SummaryChartResult } from "../charts/SummaryChart";
import { parseBenchmarkAggregatesPerRunResultFromCsv } from "../data/BenchmarkAggregateResult";
import { SummaryChartOptions } from "./types";
import { addBaseOptions, getBaseName, applyLabel, warnUnmatchedNames, mergeCustomNames, parseNamesFile, loadRunFilters, resolveChartInputs, renderChartToFile, resolveMetrics } from "./utils";

async function generateSummary(
  files: string[],
  runsToRemove: Map<string, Set<number>>,
  options: SummaryChartOptions,
): Promise<void> {
  const aggregateResults = [];

  for (const file of files) {
    console.log(`Processing file: ${file}`);
    const baseName = getBaseName(file);
    const result = applyLabel(
      await parseBenchmarkAggregatesPerRunResultFromCsv(
        file,
        options.removeFirstTicks,
        options.maxTicks,
        options.metrics,
        runsToRemove.get(baseName) ?? new Set(),
      ),
      options.trimPrefix,
      options.customNames,
      options.titleCase,
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
    minPercent: options.minPercent,
    maxUpdate: options.maxUpdate,
  });

  console.log("Chart configuration created.");
  await renderChartToFile(config, options.width, options.height, options.output);
  await exportTable?.();
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
        output: opts.output,
        removeFirstTicks: opts.removeFirstTicks,
        maxTicks: opts.maxTicks,
        trimPrefix: opts.trimPrefix,
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
      };

      const { files, runsToRemove } = await resolveChartInputs(pattern, options);
      if (options.namesFile) {
        options.customNames = mergeCustomNames(parseNamesFile(options.namesFile), options.customNames);
      }
      warnUnmatchedNames(files, options.customNames);

      await generateSummary(files, runsToRemove, options);
    });
}
