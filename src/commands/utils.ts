import path from "path";
import fs from "node:fs";
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

export function toTitleCase(s: string): string {
  return s
    .split(/[-_]|(?<=[a-z\d])(?=[A-Z])|(?<=[a-zA-Z])(?=\d)/)
    .filter(w => w.length > 0)
    .map(w => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Applies a custom label for this result if one exists in `customNames`, otherwise
 * falls back to trimming the prefix and optionally applying title case.
 * Custom names bypass all transformations (trimPrefix and titleCase).
 */
export function applyLabel<T extends { fileName: string }>(
  result: T,
  trimPrefix: string,
  customNames: Map<string, string>,
  titleCase?: boolean,
): T {
  const custom = customNames.get(result.fileName);
  if (custom !== undefined) {
    return { ...result, fileName: custom };
  }
  let r = applyTrimPrefix(result, trimPrefix);
  if (titleCase) {
    r = { ...r, fileName: toTitleCase(r.fileName) };
  }
  return r;
}

/**
 * Parses a names-file into a Map<baseName, label>.
 *
 * Format (one entry per line):
 *   key=label        # split on the first = only; label may contain =
 *   # comment lines are ignored
 *   (blank lines are ignored)
 *
 * Malformed lines (no `=`) produce a warning and are skipped.
 */
export function parseNamesFile(filePath: string): Map<string, string> {
  const raw = fs.readFileSync(filePath, "utf8");
  const map = new Map<string, string>();
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) {
      console.warn(`--names-file: malformed line (no '=' found), skipping: ${JSON.stringify(line)}`);
      continue;
    }
    map.set(line.slice(0, idx), line.slice(idx + 1));
  }
  return map;
}

/**
 * Merges a file-sourced names map with flag-sourced names.
 * Flag entries (`--name`) win on duplicate keys.
 */
export function mergeCustomNames(
  fileMap: Map<string, string>,
  flagMap: Map<string, string>,
): Map<string, string> {
  return new Map([...fileMap, ...flagMap]);
}

/**
 * Warns about any custom name keys that don't match any of the resolved input files.
 */
export function warnUnmatchedNames(files: string[], customNames: Map<string, string>): void {
  const baseNames = new Set(files.map(getBaseName));
  for (const key of customNames.keys()) {
    if (!baseNames.has(key)) {
      console.warn(`--name: key "${key}" did not match any input file (known base names: ${[...baseNames].join(", ")})`);
    }
  }
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
export const DEFAULT_METRICS = [
  MetricEnum.WHOLE_UPDATE,
  MetricEnum.ENTITY_UPDATE,
  MetricEnum.CONTROL_BEHAVIOR_UPDATE,
  MetricEnum.ELECTRIC_HEAT_FLUID_CIRCUIT_UPDATE,
  MetricEnum.TRAINS,
  MetricEnum.TRANSPORT_LINES_UPDATE,
  MetricEnum.SPACE_PLATFORMS,
  MetricEnum.PARTICLE_UPDATE,
]

/** Returns opts.metrics if the flag was provided, otherwise the default metric set. */
export function resolveMetrics(optsMetrics: MetricEnum[] | undefined): MetricEnum[] {
  return optsMetrics ?? DEFAULT_METRICS;
}

export function addBaseOptions(command: Command): Command {
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
      "--name <baseName=label>",
      "Map a save-file base name to a custom chart label (repeatable). e.g. --name \"my_map=My Map\". Takes precedence over --trim-prefix and --names-file.",
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
      `Comma-separated metric names. Examples: "wholeUpdate,entityUpdate,controlBehaviorUpdate" (summary); "entityUpdate,Inserter,AssemblingMachine,MiningDrill" (entity breakdown). Use "*" for all defaults.`,
      (it: string) => {
        if (it == "*") {
          return DEFAULT_METRICS;
        }

        return it
          .split(",")
          .map((metricName) => MetricRegistryInstance.getOrThrow(metricName));
      },
    )
    .option<number>(
      "--min-percent <number>",
      "Hide any metric whose max value never exceeds this % of the reference total across all files. 0 = no filter.",
      (it: string) => parseFloat(it),
      0,
    )
    .option(
      "--title-case",
      "Convert chart labels to title case (supports snake_case, kebab-case, PascalCase, camelCase, SCREAMING_SNAKE). Bypassed by --name overrides.",
      false,
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
