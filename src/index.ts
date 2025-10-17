#!/usr/bin/env node
import path from "path";
import { globSync } from "glob";
import { Command } from "commander";
import { BenchmarkTickResult, parseBenchmarkAveragePerTickResultFromCsv } from "./data/BenchmarkTickResult";
import { AggregationStrategy, aggregationStrategyFromString } from "./data/AggregationStrategy";
import { createSummaryChartConfiguration } from "./charts/SummaryChart";
import { createLineChartForMetrics } from "./charts/LineChart";
import { ignoreFirstTicksFromResult } from "./data/BenchmarkAggregates";
import { MetricEnum } from "./data/MetricEnum";
import { nanoToMicro } from "./utils";
import { MetricRegistryInstance } from "./data/MetricRegistry";
import { createBoxPlotChartConfiguration } from "./charts/BoxPlot";
import { Canvas } from "skia-canvas"
import { Chart, ChartConfiguration, LinearScale, CategoryScale } from "chart.js";
import fsp from 'node:fs/promises';
import { BenchmarkAggregateRunResult, parseBenchmarkAggregatesPerRunResultFromCsv, saveBenchmarkAggregateRunResultsToCsv } from "./data/BenchmarkAggregateResult";
import chalk from "chalk";
import { intro, text, select, outro, multiselect } from "@clack/prompts";
import { BoxPlotController, BoxAndWiskers } from "@sgratzl/chartjs-chart-boxplot";

Chart.register(BoxPlotController, BoxAndWiskers, CategoryScale, LinearScale);

async function summaryChartProcess(
  files: string[],
  trimPrefix: string,
  removeFirstTicks: number,
  maxTicks: number,
  metrics: MetricEnum[],
  summaryTable: boolean,
  aggregationStrategy: AggregationStrategy,
  width: number,
  height: number,
  outputFile: string
) {
  const aggregateResults: BenchmarkAggregateRunResult[] = await generateAggregateRunResults(
    files, removeFirstTicks, maxTicks, metrics, trimPrefix
  )
  const config = createSummaryChartConfiguration(aggregateResults, {
    metrics: metrics,
    includeTable: summaryTable,
    aggregationStrategy: aggregationStrategy
  });
  console.log("Chart configuration created.");
  await generateAndSaveChart(
    outputFile,
    config,
    height,
    width,
  )
  console.log(`Summary chart with table saved to ${outputFile}`);
  return;
};

async function barOrLineChartProcess(
  files: string[],
  removeFirstTicks: number,
  trimPrefix: string,
  maxUpdate: number,
  maxTicks: number,
  type: "bar" | "line",
  aggregationStrategy: AggregationStrategy,
  tickWindowAggregation: number,
  outputFile: string,
  width: number,
  height: number,
) {
  const benchmarkResults: BenchmarkTickResult[] = [];
  for (const file of files) {
    console.log(`Processing file: ${file}`);
    let result: BenchmarkTickResult = await parseBenchmarkAveragePerTickResultFromCsv(file);

    if (removeFirstTicks > 0) {
      result = ignoreFirstTicksFromResult(result, removeFirstTicks);
    }

    if (trimPrefix && result.fileName.startsWith(trimPrefix)) {
      result.fileName = result.fileName.slice(trimPrefix.length);
    }
    benchmarkResults.push(result);
  }
  let maxWholeUpdate = 0;
  if (maxUpdate) {
    maxWholeUpdate = maxUpdate * 1000
  } else {
    benchmarkResults.forEach(result => result.metricTickStats.get(MetricEnum.WHOLE_UPDATE.name).forEach(metricValue => {
      maxWholeUpdate = Math.max(maxWholeUpdate, nanoToMicro(metricValue.maximum))
    }))
  }
  const configurations = benchmarkResults.map(result => {
    return {
      result: result,
      config: createLineChartForMetrics(result, {
        maxTicks: maxTicks,
        maxUpdateValue: maxWholeUpdate,
        type: type,
        aggregationStrategy,
        tickWindow: tickWindowAggregation
      })
    }
  })
  console.log("Chart configurations created.");

  const fileNameWithoutExt = outputFile.replace(/\.[^/.]+$/, "")

  configurations.forEach(async ({ result, config }) => {
    const fileName = `${fileNameWithoutExt}_${result.fileName}.png`
    await generateAndSaveChart(
      fileName,
      config,
      height,
      width,
    )
    console.log(`Metric Line Chart Generated for ${fileName}`);
  });
  return;
};

async function boxplotChartProcess(
  files: string[],
  removeFirstTicks: number,
  maxTicks: number,
  metrics: MetricEnum[],
  trimPrefix: string,
  aggregationStrategy: AggregationStrategy,
  width: number,
  height: number,
  outputFile: string,
) {
  const aggregateResults: BenchmarkAggregateRunResult[] = await generateAggregateRunResults(
    files, removeFirstTicks, maxTicks, metrics, trimPrefix
  )
  const config = createBoxPlotChartConfiguration(aggregateResults, aggregationStrategy);
  console.log("Chart configuration created.");
  await generateAndSaveChart(
    outputFile,
    config,
    height,
    width,
  );
  console.log(`Summary chart with table saved to ${outputFile}`);
  return;
};

async function tableChartProcess(
  files: string[],
  removeFirstTicks: number,
  maxTicks: number,
  metrics: MetricEnum[],
  trimPrefix: string,
  outputFile: string,
  aggregationStrategy: AggregationStrategy,
) {
  const aggregateResults: BenchmarkAggregateRunResult[] = await generateAggregateRunResults(
    files, removeFirstTicks, maxTicks, metrics, trimPrefix
  )

  const fileNameWithoutExt = outputFile.replace(/\.[^/.]+$/, "")

  await saveBenchmarkAggregateRunResultsToCsv(aggregateResults, aggregationStrategy, `${fileNameWithoutExt}.csv`)

  console.log(`Verbose Run Statistics Saved to ${fileNameWithoutExt}`)
}

async function generateAndSaveChart(
  outputFile: string,
  configuration: ChartConfiguration,
  height: number,
  width: number,
) {
  const canvas = new Canvas(width, height)
  const chart = new Chart(
    canvas as any,
    configuration
  )
  const imageBuffer = await canvas.toBuffer("png");

  const fileNameExtension = outputFile.split('.')[-1]

  let fileName = ''

  if (fileNameExtension !== 'png') {
    console.warn(
      `Output file name ${outputFile} does not end in .png. The file extension will be adjusted `
      + 'to avoid file corruption'
    );

    const fileNameWithoutExt = outputFile.replace(/\.[^/.]+$/, "");

    fileName = fileNameWithoutExt + '.png';
  } else {
    fileName = outputFile;
  };

  await fsp.writeFile(outputFile, imageBuffer);
  chart.destroy();
}

async function generateAggregateRunResults(
  files: string[],
  removeFirstTicks: number,
  maxTicks: number,
  metrics: MetricEnum[],
  trimPrefix: string,
) {
  const aggregateResults: BenchmarkAggregateRunResult[] = []
  for (const file of files) {
    let result: BenchmarkAggregateRunResult = await generateAggregateResultsFromCSV(
      file, removeFirstTicks, maxTicks, metrics, trimPrefix
    )
    aggregateResults.push(result);
  }
  return aggregateResults;
};

async function generateAggregateResultsFromCSV(
  file: string,
  removeFirstTicks: number,
  maxTicks: number,
  metrics: MetricEnum[],
  trimPrefix: string,
) {
  console.log(`Processing file: ${file}`);
  let result: BenchmarkAggregateRunResult = await parseBenchmarkAggregatesPerRunResultFromCsv(file, removeFirstTicks, maxTicks, metrics);

  if (trimPrefix && result.fileName.startsWith(trimPrefix)) {
    result.fileName = result.fileName.slice(trimPrefix.length);
  }
  return result;
}

async function generateChartByType(
  type: string,
  files: string[],
  trimPrefix: string,
  removeFirstTicks: number,
  maxTicks: number,
  metrics: MetricEnum[],
  summaryTable: boolean,
  aggregationStrategy: AggregationStrategy,
  width: number,
  height: number,
  outputFile: string,
  maxUpdate: number,
  tickWindowAggregation: number,
) {
  switch (type) {
    case "summary":
      summaryChartProcess(
        files, trimPrefix, removeFirstTicks, maxTicks, metrics, summaryTable, aggregationStrategy, width, height, 
        outputFile
      );
      break;
    case "bar": // Fallthrough case
    case "line":
      barOrLineChartProcess(
        files, removeFirstTicks, trimPrefix, maxUpdate, maxTicks, type, aggregationStrategy, tickWindowAggregation, 
        outputFile, width, height
      );
      break;
    case "boxplot":
      boxplotChartProcess(
        files, removeFirstTicks, maxTicks, metrics, trimPrefix, aggregationStrategy, width, height, outputFile
      );
      break;
    case "table":
      tableChartProcess(files, removeFirstTicks, maxTicks, metrics, trimPrefix, outputFile, aggregationStrategy);
      break;
    default:
      console.error(`Unknown chart type: ${type}`);
      process.exit(1);
  };
}

const program = new Command();

const chartOptions = ["summary", "line", "bar", "boxplot", "table"]

program
  .name("chart-gen")
  .description("Extension of Belt's verbose_metrics to generate charts")
  .argument("<glob-pattern>", "Glob pattern for CSV files (e.g. './data/*.csv')")
  .option("-t, --type <summary | line | bar | boxplot | table>", "Comma seperated list of chart(s) to generate (default: summary)", (it: string) => {
    if (it == "*") {
      return chartOptions;
    } else {
      return it.split(",").filter((chartType) => chartOptions.includes(chartType));
    };
  }, [])
  .option("-o, --output <file>", "Output PNG file", "verbose_metrics.png")
  .option("-w, --width <px>", "Chart width in pixels", (it: string) => parseInt(it), 1400)
  .option("-h, --height <px>", "Chart height in pixels", (it: string) => parseInt(it), 800)
  .option("--remove-first-ticks <number>", "Remove the first N ticks from the data (to ignore initialization spikes)", (it: string) => parseInt(it), 3600)
  .option("--max-ticks <number>", "Max tick to include in charts", (it: string) => parseInt(it), 0)
  .option("--max-update <number>", "Max ms value to plot", (it: string) => Number(it), null)
  .option("--trim-prefix <string>", "Trim the prefix of the map name", (it: string) => it, "")
  .option("--summary-table <boolean>", "Create a verbose summary stats table in summary chart (default true)", (it) => it.toLowerCase() == "true", true)
  .option("--tick-window-aggregation <number> (default 0)", "Take the time weighted average for the tick window specified", (it: string) => Number(it), 0)
  .option("--metrics <string>", "Comma seperated list of specific metrics to use (default: *)", (it: string) => {
    if (it == "*") {
      return MetricRegistryInstance.all()
    } else {
      return it.split(",").map(metricName => MetricRegistryInstance.getOrThrow(metricName))
    }
  }, MetricRegistryInstance.all())
  .option("-a, --aggregate-strategy <average | minimum | maximum | median | standard_deviation>", "aggregate the runs by either minimum per tick or average per tick", "average")
  .action(async (globPattern, options) => {
    intro(chalk.cyan('Welcome to chart-gen!'));

    console.log(`summary-table: ${options.summaryTable}`)
    const aggregationStrategy: AggregationStrategy = aggregationStrategyFromString(options.aggregateStrategy);
    const height: number = options.height;
    const maxTicks: number = options.maxTicks;
    const maxUpdate: number = options.maxUpdate;
    const outputFile: string = path.resolve(process.cwd(), options.output);
    const removeFirstTicks: number = options.removeFirstTicks;
    const summaryTable: boolean = options.summaryTable;
    const tickWindowAggregation: number = options.tickWindowAggregation;
    const trimPrefix = options.trimPrefix;
    const type: string[] = options.type;
    let selectedTypes: symbol | string[] = type;
    const width: number = options.width;

    const metrics: MetricEnum[] = options.metrics
    console.debug(options)

    if (!globPattern || globPattern.length == 0) {
      globPattern = (await text({
        message: 'What glob pattern would you like to use for CSV files?',
        initialValue: './data/*.csv',
        validate(value) {
          if (value.length === 0) {
            return 'You must provide some kind of pattern for CSV file matching'
          }
        }
      })) as string;
    }

    if (type.length === 0) {
      selectedTypes = (await multiselect({
        message: "Which chart(s) would you like to generate?",
        options: [
          { value: 'summary', label: 'Summary' },
          { value: 'bar', label: 'Bar' },
          { value: 'line', label: 'Line' },
          { value: 'boxplot', label: 'Boxplot' },
          { value: 'table', label: 'Table' }
        ],
        required: true
      }))
    }

    selectedTypes = selectedTypes.toString().split(',')

    const files = globSync(globPattern);
    if (files.length === 0) {
      console.error(`No files matched the given pattern ${globPattern}`);
      process.exit(1);
    }

    for (const selectedType of selectedTypes) {
      await generateChartByType(
        selectedType, files, trimPrefix, removeFirstTicks, maxTicks, metrics, summaryTable, aggregationStrategy, 
        width, height, outputFile, maxUpdate, tickWindowAggregation
      )
    }

    process.exit(0);
  })

program.parse();