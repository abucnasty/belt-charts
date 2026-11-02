import { Command } from "commander";
import { aggregationStrategyFromString } from "../data/AggregationStrategy";
import {
  type BenchmarkAggregateRunResult,
  saveBenchmarkAggregateRunResultsToCsv,
} from "../data/BenchmarkAggregateResult";
import { MetricRegistryInstance } from "../data/MetricRegistry";
import { TableChartOptions } from "./types";
import { applyLabel, warnUnmatchedNames, resolveChartInputs, resolveMetrics, inputOptions, inputOptionsFrom, type ChartInput } from "./utils";
import { runInWorkerPool } from "./workerPool";
import { AggregateParseTask, buildAggregateParseTasks } from "./aggregateParseWorkerTask";

async function generateTable(
  inputs: ChartInput[],
  runsToRemove: Map<string, Set<number>>,
  options: TableChartOptions,
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

  const fileNameWithoutExt = options.output.replace(/\.[^/.]+$/, "");
  await saveBenchmarkAggregateRunResultsToCsv(
    aggregateResults,
    options.aggregateStrategy,
    `${fileNameWithoutExt}.csv`,
  );
  console.log(`Verbose Run Statistics Saved to ${fileNameWithoutExt}`);
}

export function createTableCommand(): Command {
  return inputOptions.build(new Command("table")
    .description("Export aggregate statistics to CSV table"))
    .option(
      "-o, --output <file>",
      "Output file path (without extension)",
      "verbose_metrics",
    )
    .option(
      "-w, --width <px>",
      "Chart width in pixels",
      (it: string) => parseInt(it),
      1000,
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
      "--names-file <path>",
      "Path to a names-mapping file. Each non-blank, non-comment line: baseName=label. --name flags override entries in this file.",
      (it: string) => it,
      "",
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
    .option(
      "--title-case",
      "Convert labels to title case (supports snake_case, kebab-case, PascalCase, camelCase, SCREAMING_SNAKE). Bypassed by --name overrides.",
      false,
    )
    .action(async (pattern, opts) => {
      const options: TableChartOptions = {
        width: opts.width,
        height: opts.height,
        scale: 1,
        output: opts.output,
        ...inputOptionsFrom(opts),
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
        minPercent: opts.minPercent,
        titleCase: opts.titleCase ?? false,
        groupBy: opts.groupBy ?? [],
        // table has no rendered chart title; this command exports CSV data only.
        titleOverride: null,
      };

      const { files, inputs, runsToRemove } = await resolveChartInputs(pattern, options);
      warnUnmatchedNames(files, options.customNames);

      await generateTable(inputs, runsToRemove, options);
    });
}
