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
import { BaseChartOptions, RowSort } from "./types";
import { Easing } from "../charts/animation";
import { OptionBuilder } from "./commandBuilder";
import { parseBaselinePerGroup } from "../data/baseline";
import { ERROR_BAR_MODES, ErrorBarMode } from "../data/errorBars";
import { UserError } from "../utils";
import { ChartInput, filterInputs, InputSpec, orderInputs, parseInputSpec } from "./inputs";

export type { ChartInput } from "./inputs";

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
 * A result that carries an `inputSuffix` (from `--input "<glob>:<suffix>"`) gets ` (<suffix>)` appended
 * after all of the above, including after a `--name` override.
 */
export function applyLabel<T extends { originalFileName: string; displayName: string; inputSuffix?: string }>(
  result: T,
  trimPrefix: string,
  customNames: Map<string, string>,
  titleCase?: boolean,
  trimSubstrings?: string[],
): T {
  const withSuffix = (r: T): T =>
    result.inputSuffix ? { ...r, displayName: `${r.displayName} (${result.inputSuffix})` } : r;
  const custom = customNames.get(result.originalFileName);
  if (custom !== undefined) {
    return withSuffix({ ...result, displayName: custom });
  }
  let r = applyTrimPrefix(result, trimPrefix);
  if (trimSubstrings?.length) {
    r = applyTrimSubstrings(r, trimSubstrings);
  }
  if (titleCase) {
    r = { ...r, displayName: toTitleCase(r.displayName) };
  }
  return withSuffix(r);
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

export function parseScale(value: string): number {
  const scale = Number(value);
  // skia-canvas export `density` only accepts integers.
  if (!Number.isInteger(scale) || scale < 1) {
    console.error(`Invalid --scale value: ${value}. Must be a positive integer.`);
    process.exit(1);
  }
  return scale;
}

/**
 * Adds the input-selection arguments shared by every command that reads results files:
 * the positional glob, the repeatable `--input <glob>[:<label suffix>]`, and `--include` / `--exclude`.
 * See `resolveChartInputs` for how they are combined.
 */
export const inputOptions: OptionBuilder = {
  build(command: Command): Command {
    return command
      .argument(
        "[glob-pattern]",
        "Glob pattern for CSV files (e.g. './data/*.csv'). Optional when --input is given.",
      )
      .option<string[]>(
        "--input <glob[:suffix]>",
        "Results files to chart (repeatable). An optional \":suffix\" labels that input's rows \"<label> (suffix)\", so two folders with the same file names can be charted together. e.g. --input \"malloc/*.csv:malloc\" --input \"mimalloc/*.csv:mimalloc\"",
        (val: string, acc: string[]) => [...acc, val],
        [],
      )
      .option<string[]>(
        "--include <pattern>",
        "Only chart inputs whose base name or label matches this glob pattern (repeatable, OR-matched)",
        (val: string, acc: string[]) => [...acc, val],
        [],
      )
      .option<string[]>(
        "--exclude <pattern>",
        "Skip inputs whose base name or label matches this glob pattern (repeatable). Applied after --include",
        (val: string, acc: string[]) => [...acc, val],
        [],
      );
  },
};

/**
 * Adds `--sort`, the row order of the bar charts. `total` (the default) ranks rows by their total
 * time; `input` keeps the order of the `--include` patterns, then the names file, then the inputs,
 * so a series of charts over different subsets shows the same saves in the same order; `name`
 * sorts by the label shown in the chart.
 */
export const sortOption: OptionBuilder = {
  build(command: Command): Command {
    return command.option<RowSort>(
      "--sort <total | input | name>",
      "Row order: by total time (default), in input order (--include patterns, then names file, then inputs), or by label",
      (it: string) => {
        if (it === "total" || it === "input" || it === "name") return it;
        console.error(`Invalid --sort value: ${it}. Must be one of total, input, name. Defaulting to "total".`);
        return "total";
      },
      "total",
    );
  },
};

/**
 * Adds `--baseline` and `--baseline-per-group`: the chart then draws each segment's change against
 * a baseline row (in the chart's unit, with the percent change in the table) instead of absolute values.
 */
export const baselineOptions: OptionBuilder = {
  build(command: Command): Command {
    return command
      .option<string | null>(
        "--baseline <label>",
        "Draw each row's change against this row (its label or base name) instead of absolute values. With --group-by, the row is looked up inside each group",
        (it: string) => it,
        null,
      )
      .option<Map<string, string>>(
        "--baseline-per-group <key=label,...>",
        "With --group-by: the baseline row (label or base name) of each group, e.g. \"q1=Q1 As Saved,q2=Q2 As Saved\"",
        (it: string) => parseBaselinePerGroup(it),
      );
  },
};

/**
 * Adds `--error-bars`: draws the run-to-run spread, computed from the per-run means of the total
 * (not from individual ticks), on each bar and adds it to the table.
 */
export const errorBarsOption: OptionBuilder = {
  build(command: Command): Command {
    return command.option<ErrorBarMode>(
      "--error-bars <stddev | ci95 | minmax>",
      "Draw the run-to-run spread of the per-run means on the total of each bar: sample standard deviation, 95% confidence interval of the mean, or min to max run mean. Also added to the table, with whether neighbouring rows overlap",
      (it: string) => {
        if ((ERROR_BAR_MODES as readonly string[]).includes(it)) return it as ErrorBarMode;
        throw new UserError(`Invalid --error-bars value: ${it}. Must be one of ${ERROR_BAR_MODES.join(", ")}.`);
      },
    );
  },
};

/** Exits early on baseline / error-bar arguments that cannot work, before any file is parsed. */
export function validateBaselineOptions(options: { baseline?: string | null; baselinePerGroup?: Map<string, string>; groupBy: string[]; errorBars?: ErrorBarMode }): void {
  if ((options.baselinePerGroup?.size ?? 0) > 0 && options.groupBy.length === 0) {
    throw new UserError("--baseline-per-group needs --group-by");
  }
  if (options.errorBars && (options.baseline || (options.baselinePerGroup?.size ?? 0) > 0)) {
    throw new UserError("--error-bars cannot be combined with --baseline: the spread of a difference is not drawn");
  }
}

export const baseOptions: OptionBuilder = {
  build(command: Command): Command {
    return inputOptions.build(command)
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
      .option<number>(
        "--scale <factor>",
        "Integer output pixel multiplier for higher-resolution images. -w/-h still set the layout size, so -w 1000 --scale 2 renders a 2000px-wide image with identical layout",
        parseScale,
        1,
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
  },
};

export { assignToGroup } from "../utils";

// Aggregate strategy option used by multiple chart types
export const aggregateStrategyOption: OptionBuilder = {
  build(command: Command): Command {
    return command.option(
      "-a, --aggregate-strategy <average | minimum | maximum | median | standard_deviation>",
      "Aggregate the runs by either minimum per tick or average per tick",
      "average",
    );
  },
};

/**
 * Adds the `--allow-unfiltered-metrics` opt-in flag. Charts that support it
 * skip their internal MetricProfiles filter so any metric passed via
 * `--metrics` is rendered. Layout/color/legend ordering may behave
 * unexpectedly for metrics outside the default profile.
 */
export const allowUnfilteredMetricsOption: OptionBuilder = {
  build(command: Command): Command {
    return command.option(
      "--allow-unfiltered-metrics",
      "Bypass the built-in metric profile filter so any --metrics value is rendered. WARNING: metrics outside the default profile may render or lay out unexpectedly.",
      false,
    );
  },
};

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
export const animationOptions: OptionBuilder = {
  build(command: Command): Command {
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
  },
};

/**
 * Adds the opt-in `--stagger` flag for categorical (one-row-per-save-file) bar charts —
 * `summary`, `summary-per-run`, `ups`, `ups-per-run`, `entity-summary`, `entity-summary-per-run`.
 * Not applicable to `boxplot`/`line`/`bar`, which use a different animation family.
 */
export const staggerOption: OptionBuilder = {
  build(command: Command): Command {
    return command.option(
      "--stagger",
      "Animate each bar's grow-in staggered by row (one save file/run at a time) instead of all bars growing together",
      false,
    );
  },
};

/**
 * Adds the opt-in `--value-labels` flag, which prints each stacked segment's value directly
 * on the bar. Supported by the summary/entity chart families.
 */
export const valueLabelsOption: OptionBuilder = {
  build(command: Command): Command {
    return command.option(
      "--value-labels",
      "Print each stacked segment's value on the bar",
      false,
    );
  },
};

/** Exits with an error if --animate is set but the output path isn't a .mp4 file. */
export function validateAnimateOutput(output: string, animate: boolean): void {
  if (animate && path.extname(output).toLowerCase() !== ".mp4") {
    console.error(`--animate requires -o/--output to end in .mp4, got: ${output}`);
    process.exit(1);
  }
}

/** The options every command passes through to choose its input files; spread into a command's options literal. */
export function inputOptionsFrom(opts: any): Pick<BaseChartOptions, "input" | "include" | "exclude"> {
  return {
    input: opts.input ?? [],
    include: opts.include ?? [],
    exclude: opts.exclude ?? [],
  };
}

/**
 * Resolves the positional glob and every `--input` to matched files (each remembering its label
 * suffix), applies `--include` / `--exclude`, orders them for `--sort input`, merges the names file
 * into `options.customNames`, loads run outlier filters, and ensures the output directory exists.
 * Shared by all command action handlers.
 */
export async function resolveChartInputs(
  pattern: string | undefined,
  options: Pick<BaseChartOptions, "aggregateFile" | "stddevFilter" | "output" | "input" | "include" | "exclude" | "namesFile" | "customNames" | "trimPrefix" | "titleCase" | "trimSubstrings"> & { sort?: RowSort },
): Promise<{ files: string[]; inputs: ChartInput[]; runsToRemove: Map<string, Set<number>> }> {
  // The positional pattern is taken whole (it never carries a suffix), as before.
  const specs: InputSpec[] = [...(pattern ? [{ glob: pattern }] : []), ...options.input.map(parseInputSpec)];
  if (specs.length === 0) {
    console.error("No input given: pass a glob pattern or at least one --input <glob>[:<suffix>]");
    process.exit(1);
  }
  let inputs: ChartInput[] = [];
  for (const spec of specs) {
    const matched = globSync(spec.glob);
    if (matched.length === 0) {
      console.error(`No files matched the given pattern ${spec.glob}`);
      process.exit(1);
    }
    inputs.push(...matched.map((file) => ({ file, suffix: spec.suffix })));
  }

  if (options.namesFile) {
    options.customNames = mergeCustomNames(parseNamesFile(options.namesFile), options.customNames);
  }

  // What a pattern may match: the base name and the label(s) shown in the chart.
  const candidatesOf = (input: ChartInput): string[] => {
    const base = getBaseName(input.file);
    const label = applyLabel(
      { originalFileName: base, displayName: base },
      options.trimPrefix,
      options.customNames,
      options.titleCase,
      options.trimSubstrings,
    ).displayName;
    return input.suffix ? [base, label, `${label} (${input.suffix})`] : [base, label];
  };

  if (options.include.length > 0 || options.exclude.length > 0) {
    const { kept, unmatchedIncludes, unmatchedExcludes } = filterInputs(
      inputs,
      { include: options.include, exclude: options.exclude },
      candidatesOf,
    );
    unmatchedIncludes.forEach((p) => console.warn(`--include: pattern "${p}" did not match any input`));
    unmatchedExcludes.forEach((p) => console.warn(`--exclude: pattern "${p}" did not match any input`));
    if (kept.length === 0) {
      console.error("No files left after applying --include / --exclude");
      process.exit(1);
    }
    inputs = kept;
  }

  if (options.sort === "input") {
    inputs = orderInputs(inputs, (input) => getBaseName(input.file), options.include, candidatesOf, [...options.customNames.keys()]);
  }

  const runsToRemove = await loadRunFilters(options.aggregateFile, options.stddevFilter);
  ensureOutputDir(path.resolve(process.cwd(), options.output));
  return { files: inputs.map((input) => input.file), inputs, runsToRemove };
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
  scale: number = 1,
): Promise<void> {
  const { Canvas } = await import("skia-canvas");
  const resolvedPath = path.resolve(process.cwd(), outputPath);
  const format = formatFromExtension(resolvedPath);
  const canvas = new Canvas(width, height);
  const chart = new Chart(canvas as any, config);
  const imageBuffer = await canvas.toBuffer(format, format === "png" ? { density: scale } : undefined);
  await fsp.writeFile(resolvedPath, imageBuffer);
  console.log(`Chart saved to ${resolvedPath}`);
  chart.destroy();
}
