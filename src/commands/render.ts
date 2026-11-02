import fs from "node:fs";
import path from "node:path";
import { Command, Option } from "commander";
import { parseInputSpec } from "./inputs";
import { createSummaryCommand } from "./summary";
import { createSummaryPerRunCommand } from "./summaryPerRun";
import { createUpsCommand } from "./ups";
import { createUpsPerRunCommand } from "./upsPerRun";
import { createLineCommand, createBarCommand } from "./lineBar";
import { createBoxPlotCommand } from "./boxplot";
import { createTableCommand } from "./table";
import { createEntitySummaryCommand, createEntitySummaryPerRunCommand } from "./entityBreakdown";
import { createEntityMatrixCommand } from "./entityMatrix";
import { createEntityHeatmapCommand } from "./entityHeatmap";
import { createCoreFrequencyHeatmapCommand } from "./coreFrequencyHeatmap";
import { runState } from "./utils";
import { UserError } from "../utils";

/** The commands a config can name. A fresh instance is built per chart: commander keeps parsed values on the command. */
const CHART_COMMANDS: Record<string, () => Command> = {
  summary: createSummaryCommand,
  "summary-per-run": createSummaryPerRunCommand,
  ups: createUpsCommand,
  "ups-per-run": createUpsPerRunCommand,
  line: createLineCommand,
  bar: createBarCommand,
  boxplot: createBoxPlotCommand,
  table: createTableCommand,
  "entity-summary": createEntitySummaryCommand,
  "entity-summary-per-run": createEntitySummaryPerRunCommand,
  "entity-matrix": createEntityMatrixCommand,
  "entity-heatmap": createEntityHeatmapCommand,
  "core-freq-heatmap": createCoreFrequencyHeatmapCommand,
};

/** Options whose value is a file path: resolved relative to the config file. */
const PATH_OPTIONS = new Set(["output", "names-file", "aggregate-file"]);
/** Options that may be given several times on the command line; a list in the config becomes one flag per entry. */
const REPEATABLE_OPTIONS = new Set(["input", "include", "exclude", "trim-substring", "save-name-filter"]);

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type ChartSettings = Record<string, JsonValue>;

export type RenderConfig = {
  /** Options applied to every chart that has them (e.g. width, scale, namesFile); a chart's own value wins. */
  defaults?: ChartSettings;
  charts: (ChartSettings & { command: string })[];
};

export type ChartInvocation = {
  command: string;
  /** Arguments for the command, as typed on a command line. */
  argv: string[];
  /** Short description for progress and error messages. */
  label: string;
};

const toKebab = (key: string): string => key.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

const isObject = (value: unknown): value is Record<string, JsonValue> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const resolveFrom = (configDir: string, target: string): string => path.resolve(configDir, target);

/** One `input` entry: a glob (optionally `glob:suffix`) or `{ "path": glob, "suffix": text }`. */
function inputArgument(entry: JsonValue, configDir: string, where: string): string {
  if (typeof entry === "string") {
    const spec = parseInputSpec(entry);
    const glob = resolveFrom(configDir, spec.glob);
    return spec.suffix ? `${glob}:${spec.suffix}` : glob;
  }
  if (isObject(entry) && typeof entry.path === "string") {
    const glob = resolveFrom(configDir, entry.path);
    return typeof entry.suffix === "string" && entry.suffix ? `${glob}:${entry.suffix}` : glob;
  }
  throw new UserError(`${where}: each input must be a glob string ("<glob>" or "<glob>:<suffix>") or { "path": "<glob>", "suffix": "<text>" }`);
}

/**
 * Turns a parsed config into one argument list per chart. Shared `defaults` are merged under each
 * chart's own settings, option names may be camelCase or kebab-case, and paths (inputs, output,
 * names file, aggregate file) are resolved against `configDir`.
 */
export function buildChartInvocations(config: unknown, configDir: string): ChartInvocation[] {
  if (!isObject(config) || !Array.isArray(config.charts) || config.charts.length === 0) {
    throw new UserError('The config must be an object with a non-empty "charts" list');
  }
  const defaults = config.defaults ?? {};
  if (!isObject(defaults)) throw new UserError('"defaults" must be an object of options');

  return config.charts.map((chart, index): ChartInvocation => {
    const where = `charts[${index}]`;
    if (!isObject(chart) || typeof chart.command !== "string") {
      throw new UserError(`${where}: every chart needs a "command" (${Object.keys(CHART_COMMANDS).join(", ")})`);
    }
    const factory = CHART_COMMANDS[chart.command];
    if (!factory) {
      throw new UserError(`${where}: unknown command "${chart.command}" (known: ${Object.keys(CHART_COMMANDS).join(", ")})`);
    }
    const command = factory();
    const optionByFlag = new Map<string, Option>(command.options.filter(o => o.long).map(o => [o.long!.replace(/^--/, ""), o]));

    // Chart settings win over defaults; defaults a command does not know are skipped.
    const merged = new Map<string, { value: JsonValue; fromDefaults: boolean }>();
    for (const [key, value] of Object.entries(defaults)) merged.set(toKebab(key), { value, fromDefaults: true });
    for (const [key, value] of Object.entries(chart)) {
      if (key !== "command") merged.set(toKebab(key), { value, fromDefaults: false });
    }

    const argv: string[] = [];
    const inputArgs: string[] = [];
    for (const [flag, { value, fromDefaults }] of merged) {
      if (flag === "input") {
        const entries = Array.isArray(value) ? value : [value];
        // Inputs go through --input so each can carry a suffix; the positional glob stays free.
        for (const entry of entries) inputArgs.push("--input", inputArgument(entry, configDir, `${where}.input`));
        continue;
      }
      const option = optionByFlag.get(flag);
      if (!option) {
        if (fromDefaults) continue;
        throw new UserError(`${where}: "${flag}" is not an option of ${chart.command}`);
      }
      if (value === null) continue;
      const long = `--${flag}`;
      const takesValue = option.required || option.optional;
      if (!takesValue) {
        // A plain flag: true switches it on, false leaves it off.
        if (value === true) argv.push(long);
        continue;
      }
      const asText = (v: JsonValue): string => {
        if (typeof v !== "string" && typeof v !== "number" && typeof v !== "boolean") {
          throw new UserError(`${where}: the value of "${flag}" must be a string, number or boolean`);
        }
        return PATH_OPTIONS.has(flag) && typeof v === "string" ? resolveFrom(configDir, v) : String(v);
      };
      if (flag === "name" && isObject(value)) {
        // { "base_name": "Label" } becomes one --name base_name=Label per entry.
        for (const [base, label] of Object.entries(value)) argv.push(long, `${base}=${asText(label)}`);
      } else if (Array.isArray(value)) {
        if (REPEATABLE_OPTIONS.has(flag) || flag === "name") for (const v of value) argv.push(long, asText(v));
        else argv.push(long, value.map(asText).join(","));
      } else {
        argv.push(long, asText(value));
      }
    }

    if (!merged.has("input")) throw new UserError(`${where}: no "input" (a glob, or a list of globs), here or in "defaults"`);
    if (!merged.has("output")) throw new UserError(`${where}: no "output" file for this chart`);
    const output = merged.get("output")!.value;
    return {
      command: chart.command,
      argv: [...inputArgs, ...argv],
      label: `${chart.command} -> ${typeof output === "string" ? output : "?"}`,
    };
  });
}

function readConfig(configPath: string): unknown {
  const ext = path.extname(configPath).toLowerCase();
  if (ext === ".yaml" || ext === ".yml") {
    throw new UserError("YAML configs are not supported; write the config as JSON");
  }
  let text: string;
  try {
    text = fs.readFileSync(configPath, "utf8");
  } catch {
    throw new UserError(`Cannot read the config file ${configPath}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new UserError(`${configPath} is not valid JSON: ${(error as Error).message}`);
  }
}

export function createRenderCommand(): Command {
  return new Command("render")
    .description("Render a whole chart set from one JSON config file: shared defaults once, then a list of charts, each with its command, inputs, output and overrides")
    .argument("<config.json>", "Config file. Paths inside it are relative to the file")
    .option("--dry-run", "Print the command line of every chart without rendering", false)
    .action(async (configPath: string, opts: { dryRun?: boolean }) => {
      const resolved = path.resolve(configPath);
      const invocations = buildChartInvocations(readConfig(resolved), path.dirname(resolved));
      if (opts.dryRun) {
        invocations.forEach(({ command, argv }) => console.log(`belt-charts ${command} ${argv.map(a => (/\s/.test(a) ? JSON.stringify(a) : a)).join(" ")}`));
        return;
      }
      // line / bar normally exit the process when they finish; keep going to the next chart.
      runState.keepProcessAlive = true;
      let usedLineOrBar = false;
      for (const [index, { command, argv, label }] of invocations.entries()) {
        console.log(`[${index + 1}/${invocations.length}] ${label}`);
        if (command === "line" || command === "bar") usedLineOrBar = true;
        await CHART_COMMANDS[command]().parseAsync(argv, { from: "user" });
      }
      // Tearing down worker threads after native canvas use can segfault; exit as line / bar would.
      if (usedLineOrBar) process.exit(0);
    });
}
