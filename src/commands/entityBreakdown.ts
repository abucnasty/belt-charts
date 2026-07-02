import path from "path";
import { globSync } from "glob";
import { Command, Option } from "commander";
import { Canvas } from "skia-canvas";
import { Chart } from "chart.js";
import fsp from "node:fs/promises";
import { AggregationStrategy, aggregationStrategyFromString } from "../data/AggregationStrategy";
import { createEntityBreakdownChartConfiguration } from "../charts/EntityBreakdownChart";
import {
  parseBenchmarkAggregatesPerRunResultFromCsv,
  explodeIntoPerRunResults,
} from "../data/BenchmarkAggregateResult";
import { MetricEnum } from "../data/MetricEnum";
import { MetricRegistryInstance } from "../data/MetricRegistry";
import { ensureOutputDir } from "../utils";
import { EntityBreakdownChartOptions } from "./types";
import { addBaseOptions, getBaseName, applyLabel, warnUnmatchedNames, mergeCustomNames, parseNamesFile, loadRunFilters } from "./utils";
import { enableInserterEasterEgg } from "../charts/styles";

const ENTITY_CHILDREN = MetricRegistryInstance.getChildrenOf(MetricEnum.ENTITY_UPDATE.name);
const DEFAULT_ENTITY_METRICS = [MetricEnum.ENTITY_UPDATE, ...ENTITY_CHILDREN];

async function generateEntityBreakdown(
  files: string[],
  runsToRemove: Map<string, Set<number>>,
  options: EntityBreakdownChartOptions,
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

  let chartInput = aggregateResults;
  let sortBy: "total" | "preserve" = "total";

  if (options.perRun) {
    chartInput = aggregateResults.flatMap(r => explodeIntoPerRunResults(r, options.aggregateStrategy));

    if (options.sortBy === "run") {
      chartInput.sort((a, b) => {
        const aMatch = a.fileName.match(/^(.+) \(run (\d+)\)$/);
        const bMatch = b.fileName.match(/^(.+) \(run (\d+)\)$/);
        if (!aMatch || !bMatch) {
          return a.fileName.localeCompare(b.fileName);
        }
        const baseCompare = aMatch[1].localeCompare(bMatch[1]);
        if (baseCompare !== 0) return baseCompare;
        return parseInt(aMatch[2]) - parseInt(bMatch[2]);
      });
      sortBy = "preserve";
    }
  }

  const config = createEntityBreakdownChartConfiguration(chartInput, {
    aggregationStrategy: options.aggregateStrategy,
    includeTable: options.summaryTable,
    csvTableExportName: options.summaryTableFile
      ? options.output.replace(/\.[^/.]+$/, "")
      : undefined,
    titleOverride: options.titleOverride ?? undefined,
    topN: options.topN,
    minPercent: options.minPercent,
    sortBy,
    isPerRun: options.perRun,
  });

  console.log("Chart configuration created.");
  const canvas = new Canvas(options.width, options.height);
  const chart = new Chart(canvas as any, config);
  const imageBuffer = await canvas.toBuffer("png");

  const outputFile = path.resolve(process.cwd(), options.output);
  await fsp.writeFile(outputFile, imageBuffer);
  console.log(`Entity summary chart saved to ${outputFile}`);
  chart.destroy();
}

function buildEntitySummaryOptions(command: Command): Command {
  return command
    .option<boolean>(
      "--summary-table <boolean>",
      "Create a verbose summary stats table in the chart (default true)",
      (it) => it.toLowerCase() == "true",
      true,
    )
    .option<boolean>(
      "--summary-table-file <boolean>",
      "Export the table as csv and markdown (default true)",
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
    .option<number>(
      "--top-n <number>",
      "Keep only the top N entity types by max average (others fold into 'Other Entity Update'). 0 = show all.",
      (it: string) => parseInt(it),
      15,
    )
    .option<"run" | "total">(
      "--sort-by <run | total>",
      "(per-run only) Sort bars by run number or entityUpdate total (default: total)",
      (it: string) => {
        if (it === "run" || it === "total") return it;
        console.error(`Invalid sort-by value: ${it}. Defaulting to "total".`);
        return "total";
      },
      "total",
    )
    .addOption(new Option("--fish").hideHelp());
}

function makeEntitySummaryAction(perRun: boolean) {
  return async (pattern: string, opts: any) => {
    const metrics = DEFAULT_ENTITY_METRICS;
    const options: EntityBreakdownChartOptions = {
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
      metrics,
      aggregateStrategy: opts.aggregateStrategy,
      summaryTable: opts.summaryTable,
      summaryTableFile: opts.summaryTableFile,
      titleOverride: opts.titleOverride,
      topN: opts.topN,
      perRun,
      sortBy: opts.sortBy,
      minPercent: opts.minPercent,
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
    if (opts.fish) enableInserterEasterEgg();
    if (options.namesFile) {
      options.customNames = mergeCustomNames(parseNamesFile(options.namesFile), options.customNames);
    }
    warnUnmatchedNames(files, options.customNames);

    await generateEntityBreakdown(files, runsToRemove, options);
  };
}

export function createEntitySummaryCommand(): Command {
  return buildEntitySummaryOptions(
    addBaseOptions(
      new Command("entity-summary")
        .description("Generate a stacked-bar chart breaking down entityUpdate into per-entity-type contributions"),
    )
  ).action(makeEntitySummaryAction(false));
}

export function createEntitySummaryPerRunCommand(): Command {
  return buildEntitySummaryOptions(
    addBaseOptions(
      new Command("entity-summary-per-run")
        .description("Generate a per-run stacked-bar chart breaking down entityUpdate into per-entity-type contributions"),
    )
  ).action(makeEntitySummaryAction(true));
}


