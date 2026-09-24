import path from "path";
import { Command, Option } from "commander";
import { Canvas } from "skia-canvas";
import fsp from "node:fs/promises";
import { AggregationStrategy, aggregationStrategyFromString } from "../data/AggregationStrategy";
import { parseCpuFrequencyResultsFromCsv } from "../data/CpuFrequencyResult";
import { HeatmapNormalizeMode, renderCoreFrequencyHeatmapChart } from "../charts/CoreFrequencyHeatmapChart";
import { CoreFrequencyHeatmapChartOptions } from "./types";
import {
  addBaseOptions,
  applyLabel,
  mergeCustomNames,
  parseNamesFile,
  resolveChartInputs,
} from "./utils";

/** Warns about --name keys that didn't match any save_name found across the parsed files. */
function warnUnmatchedSaveNames(saveNames: Set<string>, customNames: Map<string, string>): void {
  for (const key of customNames.keys()) {
    if (!saveNames.has(key)) {
      console.warn(`--name: key "${key}" did not match any save_name found in the input (known: ${[...saveNames].join(", ")})`);
    }
  }
}

async function generateCoreFrequencyHeatmap(
  files: string[],
  runsToRemove: Map<string, Set<number>>,
  options: CoreFrequencyHeatmapChartOptions,
): Promise<void> {
  const results = [];

  for (const file of files) {
    console.log(`Processing file: ${file}`);
    const parsed = await parseCpuFrequencyResultsFromCsv(file, runsToRemove, options.saveNameFilters);
    for (const result of parsed) {
      results.push(applyLabel(
        result,
        options.trimPrefix,
        options.customNames,
        options.titleCase,
        options.trimSubstrings,
      ));
    }
  }

  if (options.saveNameFilters.length > 0 && results.length === 0) {
    console.warn(`--save-name-filter: no save_name in the input matched patterns [${options.saveNameFilters.join(", ")}]`);
  }
  warnUnmatchedSaveNames(new Set(results.map(r => r.originalFileName)), options.customNames);

  const canvas = new Canvas(options.width, options.height);
  renderCoreFrequencyHeatmapChart(results, {
    aggregateStrategy: options.aggregateStrategy,
    normalize: options.normalize,
    showValues: options.showValues,
    titleOverride: options.titleOverride,
  }, canvas);

  const imageBuffer = await canvas.toBuffer("png");
  const outputFile = path.resolve(process.cwd(), options.output);
  await fsp.writeFile(outputFile, imageBuffer);
  console.log(`Core frequency heatmap chart saved to ${outputFile}`);
}

export function createCoreFrequencyHeatmapCommand(): Command {
  return addBaseOptions(
    new Command("core-freq-heatmap")
      .description("Generate a heatmap of per-core CPU frequency across runs (rows = runs, columns = cores)"),
  )
    .option<AggregationStrategy>(
      "-a, --aggregate-strategy <average | minimum | maximum | median | standard_deviation>",
      "Which per-core statistic to display/color",
      (it: string) => aggregationStrategyFromString(it),
      AggregationStrategy.AVERAGE,
    )
    .option<HeatmapNormalizeMode>(
      "--normalize <global | column | row>",
      "Color scale normalization: global = single scale for all cells, column = per-core, row = per-run. Default: column.",
      (it: string) => {
        if (it === "global" || it === "column" || it === "row") return it;
        console.error(`Invalid normalize value: ${it}. Defaulting to "column".`);
        return "column";
      },
      "column",
    )
    .option<boolean>(
      "--show-values <boolean>",
      "Render MHz values inside each cell (default true)",
      (it) => it.toLowerCase() === "true",
      true,
    )
    .option<string[]>(
      "--save-name-filter <glob>",
      "Glob pattern to filter which save_name values are included (repeatable, OR-matched). Matches against the save_name column, not a file path, e.g. --save-name-filter \"ship_benchmark_50_non*\"",
      (val: string, acc: string[]) => [...acc, val],
      [],
    )
    .addOption(new Option("--fish").hideHelp())
    .action(async (pattern, opts) => {
      const options: CoreFrequencyHeatmapChartOptions = {
        width: opts.width,
        height: opts.height,
        output: opts.output,
        trimPrefix: opts.trimPrefix,
        trimSubstrings: opts.trimSubstring ?? [],
        customNames: opts.name ?? new Map(),
        namesFile: opts.namesFile ?? "",
        aggregateFile: opts.aggregateFile,
        stddevFilter: opts.stddevFilter,
        titleCase: opts.titleCase,
        groupBy: opts.groupBy ?? [],
        aggregateStrategy: opts.aggregateStrategy,
        normalize: opts.normalize,
        showValues: opts.showValues,
        titleOverride: opts.titleOverride,
        saveNameFilters: opts.saveNameFilter ?? [],
      };

      const { files, runsToRemove } = await resolveChartInputs(pattern, options);
      if (options.namesFile) {
        options.customNames = mergeCustomNames(parseNamesFile(options.namesFile), options.customNames);
      }

      await generateCoreFrequencyHeatmap(files, runsToRemove, options);
    });
}
