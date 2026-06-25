#!/usr/bin/env node
import { Command } from "commander";
import {
  BoxPlotController,
  BoxAndWiskers,
} from "@sgratzl/chartjs-chart-boxplot";
import { Chart, LinearScale, CategoryScale, registerables } from "chart.js";
import {
  createSummaryCommand,
  createSummaryPerRunCommand,
  createLineCommand,
  createBarCommand,
  createBoxPlotCommand,
  createTableCommand,
  createEntitySummaryCommand,
  createEntitySummaryPerRunCommand,
  createEntityMatrixCommand,
} from "./commands";

Chart.register(
  BoxPlotController,
  BoxAndWiskers,
  LinearScale,
  CategoryScale,
  ...registerables,
);

const program = new Command();

program
  .name("belt-charts")
  .description("Extension of Belt's verbose_metrics to generate charts");

program.addCommand(createSummaryCommand());
program.addCommand(createSummaryPerRunCommand());
program.addCommand(createLineCommand());
program.addCommand(createBarCommand());
program.addCommand(createBoxPlotCommand());
program.addCommand(createTableCommand());
program.addCommand(createEntitySummaryCommand());
program.addCommand(createEntitySummaryPerRunCommand());
program.addCommand(createEntityMatrixCommand());

program.parse();
