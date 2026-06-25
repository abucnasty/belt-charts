import path from "path";
import { globSync } from "glob";
import { Canvas } from "skia-canvas";
import { Chart, type ChartConfiguration } from "chart.js";
import fsp from "node:fs/promises";
import { Command } from "commander";
import { MetricRegistryInstance } from "../data/MetricRegistry";
import {
  filterResultsOutsideStdDeviations,
  parseRunResultsFile,
} from "../data/ResultsFile";
import { MetricEnum } from "../data/MetricEnum";
import { ensureOutputDir } from "../utils";
import { BaseChartOptions } from "./types";

export function getBaseName(file: string): string {
  return path.basename(file, ".csv").replace("_verbose_metrics", "");
}

export function applyTrimPrefix<T extends { fileName: string }>(result: T, trimPrefix: string): T {
  if (trimPrefix && result.fileName.startsWith(trimPrefix)) {
    return { ...result, fileName: result.fileName.slice(trimPrefix.length) };
  }
  return result;
}

export async function loadRunFilters(
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

// Common options for all chart types
export function addBaseOptions(command: Command): Command {
  const DEFAULT_METRICS = [
    MetricEnum.WHOLE_UPDATE,
    MetricEnum.ENTITY_UPDATE,
    MetricEnum.CONTROL_BEHAVIOR_UPDATE,
    MetricEnum.ELECTRIC_HEAT_FLUID_CIRCUIT_UPDATE,
    MetricEnum.TRAINS,
    MetricEnum.TRANSPORT_LINES_UPDATE,
    MetricEnum.SPACE_PLATFORMS,
    MetricEnum.PARTICLE_UPDATE,
  ]
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
      `Comma separated list of specific metrics to use (default: "${DEFAULT_METRICS.map(it => it.name).join(",")}")`,
      (it: string) => {
        if (it == "*") {
          return DEFAULT_METRICS;
        }

        return it
          .split(",")
          .map((metricName) => MetricRegistryInstance.getOrThrow(metricName));
      },
      DEFAULT_METRICS
    );
}

// Aggregate strategy option used by multiple chart types
export function addAggregateStrategyOption(command: Command): Command {
  return command.option(
    "-a, --aggregate-strategy <average | minimum | maximum | median | standard_deviation>",
    "Aggregate the runs by either minimum per tick or average per tick",
    "average",
  );
}

/**
 * Resolves glob pattern to matched files, loads run outlier filters, and
 * ensures the output directory exists. Shared by all command action handlers.
 */
export async function resolveChartInputs(
  pattern: string,
  options: Pick<BaseChartOptions, "aggregateFile" | "stddevFilter" | "output">,
): Promise<{ files: string[]; runsToRemove: Map<string, Set<number>> }> {
  const files = globSync(pattern);
  if (files.length === 0) {
    console.error(`No files matched the given pattern ${pattern}`);
    process.exit(1);
  }
  const runsToRemove = await loadRunFilters(options.aggregateFile, options.stddevFilter);
  ensureOutputDir(path.resolve(process.cwd(), options.output));
  return { files, runsToRemove };
}

type SupportedFormat = "png" | "svg";

function formatFromExtension(filePath: string): SupportedFormat {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".svg") return "svg";
  return "png";
}

/**
 * Renders a Chart.js config to a file. Supports PNG and SVG output;
 * format is inferred from the output file extension.
 * Handles Canvas construction, rendering, and cleanup.
 */
export async function renderChartToFile(
  config: ChartConfiguration,
  width: number,
  height: number,
  outputPath: string,
): Promise<void> {
  const resolvedPath = path.resolve(process.cwd(), outputPath);
  const format = formatFromExtension(resolvedPath);
  const canvas = new Canvas(width, height);
  const chart = new Chart(canvas as any, config);
  const imageBuffer = await canvas.toBuffer(format);
  await fsp.writeFile(resolvedPath, imageBuffer);
  console.log(`Chart saved to ${resolvedPath}`);
  chart.destroy();
}
