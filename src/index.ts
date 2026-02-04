#!/usr/bin/env node
import path from "path";
import { globSync } from "glob";
import { Command } from "commander";
import {
  BenchmarkTickResult,
  parseBenchmarkAveragePerTickResultFromCsv,
} from "./data/BenchmarkTickResult";
import {
  AggregationStrategy,
  aggregationStrategyFromString,
} from "./data/AggregationStrategy";
import { createSummaryChartConfiguration } from "./charts/SummaryChart";
import { createLineChartForMetrics } from "./charts/LineChart";
import { ignoreFirstTicksFromResult } from "./data/BenchmarkAggregates";
import { MetricEnum } from "./data/MetricEnum";
import { nanoToMicro, ensureOutputDir } from "./utils";
import { MetricRegistryInstance } from "./data/MetricRegistry";
import {
  BoxPlotController,
  BoxAndWiskers,
} from "@sgratzl/chartjs-chart-boxplot";
import { createBoxPlotChartConfiguration } from "./charts/BoxPlot";
import { Canvas } from "skia-canvas";
import { Chart, LinearScale, CategoryScale, registerables } from "chart.js";
import fsp from "node:fs/promises";
import {
  BenchmarkAggregateRunResult,
  parseBenchmarkAggregatesPerRunResultFromCsv,
  saveBenchmarkAggregateRunResultsToCsv,
} from "./data/BenchmarkAggregateResult";
import {
  filterResultsOutsideStdDeviations,
  parseRunResultsFile,
  RunResultFilter,
} from "./data/ResultsFile";

Chart.register(
  BoxPlotController,
  BoxAndWiskers,
  LinearScale,
  CategoryScale,
  ...registerables,
);

const program = new Command();

// Base options shared by all chart types
type BaseChartOptions = {
  width: number;
  height: number;
  output: string;
  removeFirstTicks: number;
  maxTicks: number;
  trimPrefix: string;
  aggregateFile: string;
  stddevFilter: number;
  metrics: MetricEnum[];
};

// Summary chart specific options
type SummaryChartOptions = BaseChartOptions & {
  aggregateStrategy: AggregationStrategy;
  summaryTable: boolean;
  summaryTableFile: boolean;
  titleOverride: string | null;
};

// Line/Bar chart specific options
type LineBarChartOptions = BaseChartOptions & {
  aggregateStrategy: AggregationStrategy;
  tickWindowAggregation: number;
  maxUpdate: number | null;
  type: "line" | "bar";
};

// Boxplot chart specific options
type BoxPlotChartOptions = BaseChartOptions & {
  minUpdate: number | null;
  maxUpdate: number | null;
};

// Table chart specific options
type TableChartOptions = BaseChartOptions & {
  aggregateStrategy: AggregationStrategy;
};

async function loadRunFilters(
  aggregateFile: string,
  stddevFilter: number,
): Promise<Map<string, Set<number>>> {
  if (!aggregateFile) return new Map();

  console.log(`Parsing run results file: ${aggregateFile}`);
  const results = await parseRunResultsFile(aggregateFile);
  const filteredResults = filterResultsOutsideStdDeviations(
    results,
    stddevFilter,
  );

  for (const filter of filteredResults) {
    if (filter.remove.length === 0) continue;

    console.log(
      `Removing ${filter.remove.length} out of ${filter.keep.length + filter.remove.length} run(s) from ${filter.saveName}`,
    );
    for (const row of filter.remove) {
      console.log(
        `- Removing ${row.save_name} run index ${row.run_index} with avg_ms ${row.avg_ms}`,
      );
    }
  }

  return new Map(
    filteredResults.map((f) => [
      f.saveName,
      new Set(f.remove.map((r) => r.run_index)),
    ]),
  );
}

function getBaseName(file: string): string {
  return path.basename(file, ".csv").replace("_verbose_metrics", "");
}

function applyTrimPrefix(
  result: { fileName: string },
  trimPrefix: string,
): void {
  if (trimPrefix && result.fileName.startsWith(trimPrefix)) {
    result.fileName = result.fileName.slice(trimPrefix.length);
  }
}

async function generateSummary(
  files: string[],
  runsToRemove: Map<string, Set<number>>,
  options: SummaryChartOptions,
): Promise<void> {
  const aggregateResults: BenchmarkAggregateRunResult[] = [];

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

  const config = createSummaryChartConfiguration(aggregateResults, {
    metrics: options.metrics,
    includeTable: options.summaryTable,
    aggregationStrategy: options.aggregateStrategy,
    csvTableExportName: options.summaryTableFile
      ? options.output.replace(/\.[^/.]+$/, "")
      : undefined,
    titleOverride: options.titleOverride,
  });

  console.log("Chart configuration created.");
  const canvas = new Canvas(options.width, options.height);
  const chart = new Chart(canvas as any, config);
  const imageBuffer = await canvas.toBuffer("png");

  const outputFile = path.resolve(process.cwd(), options.output);
  await fsp.writeFile(outputFile, imageBuffer);
  console.log(`Summary chart with table saved to ${outputFile}`);
  chart.destroy();
}

async function generateLineOrBarCharts(
  files: string[],
  runsToRemove: Map<string, Set<number>>,
  options: LineBarChartOptions,
): Promise<void> {
  const benchmarkResults: BenchmarkTickResult[] = [];

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
    Math.max(
      ...benchmarkResults.flatMap((r) =>
        r.metricTickStats
          .get(MetricEnum.WHOLE_UPDATE.name)!
          .map((v) => nanoToMicro(v.maximum)),
      ),
    );

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

async function generateBoxPlot(
  files: string[],
  runsToRemove: Map<string, Set<number>>,
  options: BoxPlotChartOptions,
): Promise<void> {
  const aggregateResults: BenchmarkAggregateRunResult[] = [];

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

async function generateTable(
  files: string[],
  runsToRemove: Map<string, Set<number>>,
  options: TableChartOptions,
): Promise<void> {
  const aggregateResults: BenchmarkAggregateRunResult[] = [];

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

  const fileNameWithoutExt = options.output.replace(/\.[^/.]+$/, "");
  await saveBenchmarkAggregateRunResultsToCsv(
    aggregateResults,
    options.aggregateStrategy,
    `${fileNameWithoutExt}.csv`,
  );
  console.log(`Verbose Run Statistics Saved to ${fileNameWithoutExt}`);
}

// Common options for all chart types
function addBaseOptions(command: Command): Command {
  return command
    .argument(
      "<glob-pattern>",
      "Glob pattern for CSV files (e.g. './data/*.csv')",
    )
    .option("-o, --output <file>", "Output file path", "verbose_metrics.png")
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
      3600,
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
    );
}

// Aggregate strategy option used by multiple chart types
function addAggregateStrategyOption(command: Command): Command {
  return command.option(
    "-a, --aggregate-strategy <average | minimum | maximum | median | standard_deviation>",
    "Aggregate the runs by either minimum per tick or average per tick",
    "average",
  );
}

program
  .name("belt-charts")
  .description("Extension of Belt's verbose_metrics to generate charts");

// Summary chart command
addBaseOptions(
  program
    .command("summary")
    .description("Generate a summary chart with aggregate statistics table"),
)
  .option(
    "--summary-table <boolean>",
    "Create a verbose summary stats table in summary chart (default true)",
    (it) => it.toLowerCase() == "true",
    true,
  )
  .option(
    "--summary-table-file <boolean>",
    "Export as csv and markdown (default true)",
    (it) => it.toLowerCase() == "true",
    true,
  )
  .option(
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
      aggregateStrategy: aggregationStrategyFromString(opts.aggregateStrategy),
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

// Line chart command
addAggregateStrategyOption(
  addBaseOptions(
    program
      .command("line")
      .description("Generate line charts showing metrics over time"),
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
      type: "line",
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

// Bar chart command
addAggregateStrategyOption(
  addBaseOptions(
    program
      .command("bar")
      .description("Generate bar charts showing metrics over time"),
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
      type: "bar",
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

// Boxplot chart command
addBaseOptions(
  program
    .command("boxplot")
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

// Table command - has different output default (no extension)
program
  .command("table")
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
    3600,
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
      aggregateFile: opts.aggregateFile,
      stddevFilter: opts.stddevFilter,
      metrics: opts.metrics,
      aggregateStrategy: aggregationStrategyFromString(opts.aggregateStrategy),
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

    await generateTable(files, runsToRemove, options);
  });

program.parse();
