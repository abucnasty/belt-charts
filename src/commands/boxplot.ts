import { Command } from "commander";
import { createBoxPlotChartConfiguration } from "../charts/BoxPlot";
import { parseBenchmarkAggregatesPerRunResultFromCsv } from "../data/BenchmarkAggregateResult";
import { BoxPlotChartOptions } from "./types";
import { addBaseOptions, getBaseName, applyTrimPrefix, loadRunFilters, resolveChartInputs, renderChartToFile } from "./utils";

async function generateBoxPlot(
  files: string[],
  runsToRemove: Map<string, Set<number>>,
  options: BoxPlotChartOptions,
): Promise<void> {
  const aggregateResults = [];

  for (const file of files) {
    console.log(`Processing file: ${file}`);
    const baseName = getBaseName(file);
    const result = applyTrimPrefix(
      await parseBenchmarkAggregatesPerRunResultFromCsv(
        file,
        options.removeFirstTicks,
        options.maxTicks,
        options.metrics,
        runsToRemove.get(baseName) ?? new Set(),
      ),
      options.trimPrefix,
    );
    aggregateResults.push(result);
  }

  const config = createBoxPlotChartConfiguration(aggregateResults, {
    minUpdateTime: options.minUpdate,
    maxUpdateTime: options.maxUpdate,
  });

  console.log("Chart configuration created.");
  await renderChartToFile(config, options.width, options.height, options.output);
}

export function createBoxPlotCommand(): Command {
  return addBaseOptions(
    new Command("boxplot")
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

      const { files, runsToRemove } = await resolveChartInputs(pattern, options);

      await generateBoxPlot(files, runsToRemove, options);
    });
}
