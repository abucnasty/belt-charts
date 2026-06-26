import path from "path";
import { globSync } from "glob";
import { Command } from "commander";
import { Canvas } from "skia-canvas";
import fsp from "node:fs/promises";
import { AggregationStrategy, aggregationStrategyFromString } from "../data/AggregationStrategy";
import { renderEntityMatrixChart } from "../charts/EntityMatrixChart";
import { parseBenchmarkAggregatesPerRunResultFromCsv } from "../data/BenchmarkAggregateResult";
import { MetricEnum } from "../data/MetricEnum";
import { MetricRegistryInstance } from "../data/MetricRegistry";
import { ensureOutputDir } from "../utils";
import { EntityMatrixChartOptions } from "./types";
import { addBaseOptions, getBaseName, applyTrimPrefix, loadRunFilters, resolveMetrics } from "./utils";

const ENTITY_CHILDREN = MetricRegistryInstance.getChildrenOf(MetricEnum.ENTITY_UPDATE.name);
const DEFAULT_ENTITY_METRICS = [MetricEnum.ENTITY_UPDATE, ...ENTITY_CHILDREN];

async function generateEntityMatrix(
  files: string[],
  runsToRemove: Map<string, Set<number>>,
  options: EntityMatrixChartOptions,
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

  renderEntityMatrixChart(results, {
    aggregationStrategy: options.aggregateStrategy,
    topN: options.topN,
    minPercent: options.minPercent,
    titleOverride: options.titleOverride,
  }, canvas);

  const imageBuffer = await canvas.toBuffer("png");
  const outputFile = path.resolve(process.cwd(), options.output);
  await fsp.writeFile(outputFile, imageBuffer);
  console.log(`Entity matrix chart saved to ${outputFile}`);
}

export function createEntityMatrixCommand(): Command {
  return addBaseOptions(
    new Command("entity-matrix")
      .description("Generate a panel chart showing each entity type as a row and each benchmark file as a column"),
  )
    .option<AggregationStrategy>(
      "-a, --aggregate-strategy <average | minimum | maximum | median | standard_deviation>",
      "Aggregate the runs by either minimum per tick or average per tick",
      (it: string) => aggregationStrategyFromString(it),
      AggregationStrategy.AVERAGE,
    )
    .option<number>(
      "--top-n <number>",
      "Keep only the top N entity types by max average (others fold into 'Other Entity Update'). 0 = show all.",
      (it: string) => parseInt(it),
      15,
    )
    .option<string | null>(
      "--title-override <string>",
      "Override the title of the chart",
      (it: string) => it,
      null,
    )
    .action(async (pattern, opts) => {
      const options: EntityMatrixChartOptions = {
        width: opts.width,
        height: opts.height,
        output: opts.output,
        removeFirstTicks: opts.removeFirstTicks,
        maxTicks: opts.maxTicks,
        trimPrefix: opts.trimPrefix,
        aggregateFile: opts.aggregateFile,
        stddevFilter: opts.stddevFilter,
        metrics: resolveMetrics(opts.metrics),
        aggregateStrategy: opts.aggregateStrategy,
        topN: opts.topN,
        minPercent: opts.minPercent,
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

      await generateEntityMatrix(files, runsToRemove, options);
    });
}
