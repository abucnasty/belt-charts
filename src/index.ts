#!/usr/bin/env node
import { isMainThread, parentPort, workerData } from "worker_threads";
import { Command } from "commander";
import { version } from "../package.json";
import {
  BoxPlotController,
  BoxAndWiskers,
} from "@sgratzl/chartjs-chart-boxplot";
import { Chart, LinearScale, CategoryScale, registerables } from "chart.js";
import {
  createSummaryCommand,
  createSummaryPerRunCommand,
  createUpsCommand,
  createUpsPerRunCommand,
  createLineCommand,
  createBarCommand,
  createBoxPlotCommand,
  createTableCommand,
  createEntitySummaryCommand,
  createEntitySummaryPerRunCommand,
  createEntityMatrixCommand,
  createEntityHeatmapCommand,
  createCoreFrequencyHeatmapCommand,
} from "./commands";
import { runLineBarWorkerTask, type LineBarWorkerTask } from "./commands/lineBarWorkerTask";

Chart.register(
  BoxPlotController,
  BoxAndWiskers,
  LinearScale,
  CategoryScale,
  ...registerables,
);

if (!isMainThread) {
  runLineBarWorkerTask(workerData as LineBarWorkerTask).then(
    (result) => parentPort!.postMessage({ ok: true, result }),
    (error: unknown) => parentPort!.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) }),
  );
} else {
  const program = new Command();

  program
    .name("belt-charts")
    .description("Extension of Belt's verbose_metrics to generate charts")
    .version(version, "-v, --version", "Output the current version");

  program.addCommand(createUpsCommand());
  program.addCommand(createUpsPerRunCommand());
  program.addCommand(createSummaryCommand());
  program.addCommand(createSummaryPerRunCommand());
  program.addCommand(createLineCommand());
  program.addCommand(createBarCommand());
  program.addCommand(createBoxPlotCommand());
  program.addCommand(createTableCommand());
  program.addCommand(createEntitySummaryCommand());
  program.addCommand(createEntitySummaryPerRunCommand());
  program.addCommand(createEntityMatrixCommand());
  program.addCommand(createEntityHeatmapCommand());
  program.addCommand(createCoreFrequencyHeatmapCommand());

  program.parse();
}

