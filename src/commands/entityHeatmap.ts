import path from "path";
import { globSync } from "glob";
import { Command } from "commander";
import { Canvas } from "skia-canvas";
import fsp from "node:fs/promises";
import { AggregationStrategy, aggregationStrategyFromString } from "../data/AggregationStrategy";
import { HeatmapNormalizeMode, renderEntityHeatmapChart } from "../charts/EntityHeatmapChart";
import { parseBenchmarkAggregatesPerRunResultFromCsv } from "../data/BenchmarkAggregateResult";
import { MetricEnum } from "../data/MetricEnum";
import { MetricRegistryInstance } from "../data/MetricRegistry";
import { ensureOutputDir } from "../utils";
import { EntityHeatmapChartOptions } from "./types";
import { addBaseOptions, getBaseName, applyTrimPrefix, loadRunFilters } from "./utils";

const ENTITY_CHILDREN = MetricRegistryInstance.getChildrenOf(MetricEnum.ENTITY_UPDATE.name);
const DEFAULT_ENTITY_METRICS = [MetricEnum.ENTITY_UPDATE, ...ENTITY_CHILDREN];

async function generateEntityHeatmap(
  files: string[],
  runsToRemove: Map<string, Set<number>>,
  options: EntityHeatmapChartOptions,
): Promise<void> {
  const results = [];

  for (const file of files) {
    console.log(`Processing file: ${file}`);
    const baseName = getBaseName(file);
    const result = await parseBenchmarkAggregatesPerRunResultFromCsv(
      file,
      options.removeFirstTicks,
      options.maxTicks,
      DEFAULT_ENTITY_METRICS,
      runsToRemove.get(baseName) ?? new Set(),
    );
    applyTrimPrefix(result, options.trimPrefix);
    results.push(result);
  }

  const canvas = new Canvas(options.width, options.height);

  renderEntityHeatmapChart(results, {
    aggregationStrategy: options.aggregateStrategy,
    topN: options.topN,
    minPercent: options.minPercent,
    normalize: options.normalize,
    showValues: options.showValues,
    titleOverride: options.titleOverride,
  }, canvas);

  const imageBuffer = await canvas.toBuffer("png");
  const outputFile = path.resolve(process.cwd(), options.output);
  await fsp.writeFile(outputFile, imageBuffer);
  console.log(`Entity heatmap chart saved to ${outputFile}`);
}

export function createEntityHeatmapCommand(): Command {
  return addBaseOptions(
    new Command("entity-heatmap")
      .description("Generate a heatmap comparing entity-type µs values across benchmark files (rows = entity types, columns = designs)"),
  )
    .option<AggregationStrategy>(
      "-a, --aggregate-strategy <average | minimum | maximum | median | standard_deviation>",
      "Aggregate the runs by either minimum per tick or average per tick",
      (it: string) => aggregationStrategyFromString(it),
      AggregationStrategy.AVERAGE,
    )
    .option<number>(
      "--top-n <number>",
      "Keep only the top N entity types by max average. 0 = show all. Default 20.",
      (it: string) => parseInt(it),
      20,
    )
    .option<number>(
      "--min-percent <number>",
      "Hide entity rows whose max value never exceeds this % of entityUpdate total in any file. 0 = no filter. Default 0.5.",
      (it: string) => parseFloat(it),
      0.5,
    )
    .option<HeatmapNormalizeMode>(
      "--normalize <global | column | row>",
      "Color scale normalization: global = single scale for all cells, column = per-design, row = per-entity-type. Default: global.",
      (it: string) => {
        if (it === "global" || it === "column" || it === "row") return it;
        console.error(`Invalid normalize value: ${it}. Defaulting to "global".`);
        return "global";
      },
      "global",
    )
    .option<boolean>(
      "--show-values <boolean>",
      "Render µs values inside each cell (default true)",
      (it) => it.toLowerCase() === "true",
      true,
    )
    .option<string | null>(
      "--title-override <string>",
      "Override the chart title",
      (it: string) => it,
      null,
    )
    .action(async (pattern, opts) => {
      const options: EntityHeatmapChartOptions = {
        width: opts.width,
        height: opts.height,
        output: opts.output,
        removeFirstTicks: opts.removeFirstTicks,
        maxTicks: opts.maxTicks,
        trimPrefix: opts.trimPrefix,
        aggregateFile: opts.aggregateFile,
        stddevFilter: opts.stddevFilter,
        metrics: opts.metrics,
        aggregateStrategy: opts.aggregateStrategy,
        topN: opts.topN,
        minPercent: opts.minPercent,
        normalize: opts.normalize,
        showValues: opts.showValues,
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

      await generateEntityHeatmap(files, runsToRemove, options);
    });
}
