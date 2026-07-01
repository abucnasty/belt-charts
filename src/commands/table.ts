import { Command } from "commander";
import { aggregationStrategyFromString } from "../data/AggregationStrategy";
import {
  parseBenchmarkAggregatesPerRunResultFromCsv,
  saveBenchmarkAggregateRunResultsToCsv,
} from "../data/BenchmarkAggregateResult";
import { MetricRegistryInstance } from "../data/MetricRegistry";
import { TableChartOptions } from "./types";
import { getBaseName, applyLabel, warnUnmatchedNames, loadRunFilters, resolveChartInputs, resolveMetrics } from "./utils";

async function generateTable(
  files: string[],
  runsToRemove: Map<string, Set<number>>,
  options: TableChartOptions,
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
    );
    aggregateResults.push(result);
  }

  const fileNameWithoutExt = options.output.replace(/\.[^/.]+$/, "");
  await saveBenchmarkAggregateRunResultsToCsv(
    aggregateResults,
    options.aggregateStrategy,
    `${fileNameWithoutExt}.csv`,
  );
  console.log(`Verbose Run Statistics Saved to ${fileNameWithoutExt}`);
}

export function createTableCommand(): Command {
  return new Command("table")
    .description("Export aggregate statistics to CSV table")
    .argument(
      "<glob-pattern>",
      "Glob pattern for CSV files (e.g. './data/*.csv')",
    )
    .option(
      "-o, --output <file>",
      "Output file path (without extension)",
      "verbose_metrics",
    )
    .option(
      "-w, --width <px>",
      "Chart width in pixels",
      (it: string) => parseInt(it),
      1400,
    )
    .option(
      "-h, --height <px>",
      "Chart height in pixels",
      (it: string) => parseInt(it),
      800,
    )
    .option(
      "--remove-first-ticks <number>",
      "Remove the first N ticks from the data (to ignore initialization spikes)",
      (it: string) => parseInt(it),
      1,
    )
    .option(
      "--max-ticks <number>",
      "Max tick to include in charts",
      (it: string) => parseInt(it),
      0,
    )
    .option(
      "--trim-prefix <string>",
      "Trim the prefix of the map name",
      (it: string) => it,
      "",
    )
    .option(
      "--name <baseName=label>",
      "Map a save-file base name to a custom chart label (repeatable). e.g. --name \"my_map=My Map\". Takes precedence over --trim-prefix.",
      (val: string, acc: Map<string, string>) => {
        const idx = val.indexOf("=");
        if (idx === -1) {
          console.warn(`--name: invalid format "${val}", expected "<baseName>=<label>". Skipping.`);
          return acc;
        }
        acc.set(val.slice(0, idx), val.slice(idx + 1));
        return acc;
      },
      new Map<string, string>(),
    )
    .option(
      "--aggregate-file <string>",
      "Path to aggregate run results file",
      (it: string) => it,
      "",
    )
    .option(
      "--stddev-filter <number>",
      "Number of standard deviations to use for filtering run results",
      (it: string) => Number(it),
      3,
    )
    .option(
      "--metrics <string>",
      "Comma separated list of specific metrics to use (default: *)",
      (it: string) => {
        if (it == "*") {
          return MetricRegistryInstance.all();
        } else {
          return it
            .split(",")
            .map((metricName) => MetricRegistryInstance.getOrThrow(metricName));
        }
      },
      MetricRegistryInstance.all(),
    )
    .option(
      "-a, --aggregate-strategy <average | minimum | maximum | median | standard_deviation>",
      "Aggregate the runs by either minimum per tick or average per tick",
      "average",
    )
    .action(async (pattern, opts) => {
      const options: TableChartOptions = {
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
        minPercent: opts.minPercent,
      };

      const { files, runsToRemove } = await resolveChartInputs(pattern, options);
      warnUnmatchedNames(files, options.customNames);

      await generateTable(files, runsToRemove, options);
    });
}
