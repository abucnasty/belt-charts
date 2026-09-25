import path from "path";
import fs from "node:fs";
import { globSync } from "glob";
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
import { assignToGroup } from "../utils";
import { BaseChartOptions } from "./types";
import { Easing } from "../charts/animation";

export function getBaseName(file: string): string {
  return path.basename(file, ".csv").replace("_verbose_metrics", "");
}

export function applyTrimPrefix<T extends { displayName: string }>(result: T, trimPrefix: string): T {
  if (trimPrefix && result.displayName.startsWith(trimPrefix)) {
    return { ...result, displayName: result.displayName.slice(trimPrefix.length) };
  }
  return result;
}

export function applyTrimSubstrings<T extends { displayName: string }>(result: T, trimSubstrings: string[]): T {
  if (trimSubstrings.length === 0) return result;
  // Sort longest-first so that e.g. "clone_18" is removed before "clone_1" can partially match within it.
  const sorted = [...trimSubstrings].sort((a, b) => b.length - a.length);
  let name = result.displayName;
  for (const sub of sorted) {
    if (sub) name = name.split(sub).join("");
  }
  return { ...result, displayName: name };
}

export function toTitleCase(s: string): string {
  return s
    .split(/[-_]|(?<=[a-z\d])(?=[A-Z])|(?<=[a-zA-Z])(?=\d)/)
    .filter(w => w.length > 0)
    .map(w => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Applies the display-name transform pipeline in order:
 *   1. If `originalFileName` matches a `customNames` entry, use that label verbatim (bypasses all other steps).
 *   2. Otherwise: trimPrefix -> trimSubstrings -> titleCase, writing to `displayName`.
 * `originalFileName` is preserved unchanged so downstream lookups (group matching, run filters) still work.
 */
export function applyLabel<T extends { originalFileName: string; displayName: string }>(
  result: T,
  trimPrefix: string,
  customNames: Map<string, string>,
  titleCase?: boolean,
  trimSubstrings?: string[],
): T {
  const custom = customNames.get(result.originalFileName);
  if (custom !== undefined) {
    return { ...result, displayName: custom };
  }
  let r = applyTrimPrefix(result, trimPrefix);
  if (trimSubstrings?.length) {
    r = applyTrimSubstrings(r, trimSubstrings);
  }
  if (titleCase) {
    r = { ...r, displayName: toTitleCase(r.displayName) };
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
    .option<boolean>(
      "--title-case [boolean]",
      "Convert chart labels to title case (supports snake_case, kebab-case, PascalCase, camelCase, SCREAMING_SNAKE). Bypassed by --name overrides.",
      (it: string) => it !== "false",
      false,
    )
    .option<string[]>(
      "--trim-substring <string>",
      "Remove all occurrences of a substring from chart labels (repeatable). Applied after --trim-prefix and before --title-case. Bypassed by --name overrides.",
      (val: string, acc: string[]) => [...acc, val],
      [],
    )
    .option<string[]>(
      "--group-by <keys>",
      "Comma-separated list of group keys. Each result is assigned to the longest key that is a substring of its label. Results not matching any key are excluded. e.g. \"q1,q2,q2_lds\" or \"clone_0,clone_1,clone_18\"",
      (it: string) => it.split(",").map((s) => s.trim()).filter(Boolean),
      [],
    )
    .option<string | null>(
      "--title-override <string>",
      "Override the chart's auto-generated title",
      (it: string) => it,
      null,
    );
}

export { assignToGroup } from "../utils";

// Aggregate strategy option used by multiple chart types
export function addAggregateStrategyOption(command: Command): Command {
  return command.option(
    "-a, --aggregate-strategy <average | minimum | maximum | median | standard_deviation>",
    "Aggregate the runs by either minimum per tick or average per tick",
    "average",
  );
}

/**
 * Adds the `--allow-unfiltered-metrics` opt-in flag. Charts that support it
 * skip their internal MetricProfiles filter so any metric passed via
 * `--metrics` is rendered. Layout/color/legend ordering may behave
 * unexpectedly for metrics outside the default profile.
 */
export function addAllowUnfilteredMetricsOption(command: Command): Command {
  return command.option(
    "--allow-unfiltered-metrics",
    "Bypass the built-in metric profile filter so any --metrics value is rendered. WARNING: metrics outside the default profile may render or lay out unexpectedly.",
    false,
  );
}

/** Emits a warning when --allow-unfiltered-metrics is enabled. */
export function warnAllowUnfilteredMetrics(enabled: boolean): void {
  if (enabled) {
    console.warn(
      "--allow-unfiltered-metrics: built-in metric filter bypassed. Unexpected rendering, ordering, or legend behavior may occur.",
    );
  }
}

const VALID_EASINGS: Easing[] = ["linear", "ease-out", "ease-in-out"];

/**
 * Adds the opt-in `--animate` flag plus its `--duration`/`--fps`/`--easing` controls.
 * Only applied to commands whose chart is built from a Chart.js config (see
 * `renderChartAnimationToFile`) — not every command supports animation.
 */
export function addAnimationOptions(command: Command): Command {
  return command
    .option("--animate", "Render an animated MP4 instead of a static image. Requires -o/--output to end in .mp4", false)
    .option<number>(
      "--duration <seconds>",
      "Animation duration in seconds",
      (it: string) => parseFloat(it),
      3,
    )
    .option<number>(
      "--fps <number>",
      "Animation frame rate",
      (it: string) => parseInt(it),
      30,
    )
    .option<Easing>(
      "--easing <linear|ease-out|ease-in-out>",
      "Animation easing curve",
      (it: string) => {
        if (VALID_EASINGS.includes(it as Easing)) return it as Easing;
        console.error(`Invalid --easing value: ${it}. Must be one of ${VALID_EASINGS.join(", ")}. Defaulting to "ease-out".`);
        return "ease-out";
      },
      "ease-out",
    )
    .option<number>(
      "--hold <seconds>",
      "Extra seconds to hold the final frame at the end of the animation",
      (it: string) => parseFloat(it),
      1,
    );
}

/**
 * Adds the opt-in `--stagger` flag for categorical (one-row-per-save-file) bar charts —
 * `summary`, `summary-per-run`, `ups`, `ups-per-run`, `entity-summary`, `entity-summary-per-run`.
 * Not applicable to `boxplot`/`line`/`bar`, which use a different animation family.
 */
export function addStaggerOption(command: Command): Command {
  return command.option(
    "--stagger",
    "Animate each bar's grow-in staggered by row (one save file/run at a time) instead of all bars growing together",
    false,
  );
}

/** Exits with an error if --animate is set but the output path isn't a .mp4 file. */
export function validateAnimateOutput(output: string, animate: boolean): void {
  if (animate && path.extname(output).toLowerCase() !== ".mp4") {
    console.error(`--animate requires -o/--output to end in .mp4, got: ${output}`);
    process.exit(1);
  }
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
 * Imports skia-canvas lazily so modules that only need other utils in this
 * file (e.g. worker-thread task code) never load its native addon.
 */
export async function renderChartToFile(
  config: ChartConfiguration,
  width: number,
  height: number,
  outputPath: string,
): Promise<void> {
  const { Canvas } = await import("skia-canvas");
  const resolvedPath = path.resolve(process.cwd(), outputPath);
  const format = formatFromExtension(resolvedPath);
  const canvas = new Canvas(width, height);
  const chart = new Chart(canvas as any, config);
  const imageBuffer = await canvas.toBuffer(format);
  await fsp.writeFile(resolvedPath, imageBuffer);
  console.log(`Chart saved to ${resolvedPath}`);
  chart.destroy();
}
