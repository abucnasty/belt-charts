#!/usr/bin/env node
import { globSync } from "glob";
import { Command } from "commander";
import { BenchmarkTickResult, parseBenchmarkAveragePerTickResultFromCsv } from "./data/BenchmarkTickResult";
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
import { BeltChartContext } from "./charts/BeltChartContext";

Chart.register(BoxPlotController, BoxAndWiskers, CategoryScale, LinearScale);

/**
 * Generate a summary chart and save the chart as a PNG
 * 
 * @param chartArguments 
 * @param files 
 */
async function summaryChartProcess(
  chartArguments: BeltChartContext,
  files: string[],
) {
  const aggregateResults: BenchmarkAggregateRunResult[] = await generateAggregateRunResults(
    files, chartArguments.removeFirstTicks, chartArguments.maxTicks, chartArguments.metrics, chartArguments.trimPrefix
  )
  const config = createSummaryChartConfiguration(aggregateResults, {
    metrics: chartArguments.metrics,
    includeTable: chartArguments.summaryTable,
    aggregationStrategy: chartArguments.aggregationStrategy,
  });
  console.log("Chart configuration created.");
  await generateAndSaveChart(
    chartArguments.outputFile,
    config,
    chartArguments.height,
    chartArguments.width,
  )
  console.log(`Summary chart with table saved to ${chartArguments.outputFile}`);
};

/**
 * Generate a bar or line chart and save the chart as a PNG
 * 
 * @param chartArguments 
 * @param files 
 */
async function barOrLineChartProcess(
  chartArguments: BeltChartContext,
  files: string[],
) {
  const benchmarkResults: BenchmarkTickResult[] = [];
  for (const file of files) {
    console.log(`Processing file: ${file}`);
    let result: BenchmarkTickResult = await parseBenchmarkAveragePerTickResultFromCsv(file);

    if (chartArguments.removeFirstTicks > 0) {
      result = ignoreFirstTicksFromResult(result, chartArguments.removeFirstTicks);
    }

    if (chartArguments.trimPrefix && result.fileName.startsWith(chartArguments.trimPrefix)) {
      result.fileName = result.fileName.slice(chartArguments.trimPrefix.length);
    }
    benchmarkResults.push(result);
  }
  let maxWholeUpdate = 0;
  if (chartArguments.maxUpdate) {
    maxWholeUpdate = chartArguments.maxUpdate * 1000
  } else {
    benchmarkResults.forEach(result => result.metricTickStats.get(MetricEnum.WHOLE_UPDATE.name).forEach(metricValue => {
      maxWholeUpdate = Math.max(maxWholeUpdate, nanoToMicro(metricValue.maximum))
    }))
  }
  const configurations = benchmarkResults.map(result => {
    return {
      result: result,
      config: createLineChartForMetrics(result, {
        maxTicks: chartArguments.maxTicks,
        maxUpdateValue: maxWholeUpdate,
        type: chartArguments.type as "bar" | "line",
        aggregationStrategy: chartArguments.aggregationStrategy,
        tickWindow: chartArguments.tickWindowAggregation,
      })
    }
  })
  console.log("Chart configurations created.");

  const fileNameWithoutExt = chartArguments.outputFile.replace(/\.[^/.]+$/, "")

  configurations.forEach(async ({ result, config }) => {
    const fileName = `${fileNameWithoutExt}_${result.fileName}.png`
    await generateAndSaveChart(
      fileName,
      config,
      chartArguments.height,
      chartArguments.width,
    )
    console.log(`Metric Line Chart Generated for ${fileName}`);
  });
};

/**
 * Generate a boxplot chart and save the chart as a PNG
 * 
 * @param chartArguments Arguments for generating chart
 * @param files List of data files to process
 */
async function boxplotChartProcess(
  chartArguments: BeltChartContext,
  files: string[],
) {
  const aggregateResults: BenchmarkAggregateRunResult[] = await generateAggregateRunResults(
    files, chartArguments.removeFirstTicks, chartArguments.maxTicks, chartArguments.metrics, chartArguments.trimPrefix
  )
  const config = createBoxPlotChartConfiguration(aggregateResults, chartArguments.aggregationStrategy);
  console.log("Chart configuration created.");
  await generateAndSaveChart(
    chartArguments.outputFile,
    config,
    chartArguments.height,
    chartArguments.width,
  );
  console.log(`Summary chart with table saved to ${chartArguments.outputFile}`);
};

/**
 * Generate a CSV file of aggregated chart data
 * 
 * @param chartArguments Arguments for generating data
 * @param files List of data files to process
 */
async function tableChartProcess(
  chartArguments: BeltChartContext,
  files: string[],
) {
  const aggregateResults: BenchmarkAggregateRunResult[] = await generateAggregateRunResults(
    files,
    chartArguments.removeFirstTicks,
    chartArguments.maxTicks,
    chartArguments.metrics,
    chartArguments.trimPrefix,
  )

  const fileNameWithoutExt = chartArguments.outputFile.replace(/\.[^/.]+$/, "")

  await saveBenchmarkAggregateRunResultsToCsv(aggregateResults, chartArguments.aggregationStrategy, `${fileNameWithoutExt}.csv`)

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
  chartArguments: BeltChartContext,
  files: string[],
) {
  switch (chartArguments.type) {
    case "summary":
      summaryChartProcess(
        chartArguments, files,
      );
      break;
    case "bar":
    case "line":
      barOrLineChartProcess(
        chartArguments, files,
      );
      break;
    case "boxplot":
      boxplotChartProcess(
        chartArguments, files, 
      );
      break;
    case "table":
      tableChartProcess(
        chartArguments, files,
      );
      break;
    default:
      console.error(`Unknown chart type: ${chartArguments.type}`);
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
    const type: string[] = options.type;
    let selectedTypes: symbol | string[] = type;
    console.debug(options)

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
    };

    for (const selectedType of selectedTypes) {
      // TODO: Find a better way to support multiple output files
      let outputFile: string = options.outputFile
      outputFile.replace('.csv', `_${selectedType}.csv`)
      options.type = selectedType;
      let chartArguments = BeltChartContext.fromOptions(options)
      await generateChartByType(
        chartArguments, files,
      )
    };

    process.exit(0);
  })

program.parse();