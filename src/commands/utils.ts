import path from "path";
import { Command } from "commander";
import { MetricRegistryInstance } from "../data/MetricRegistry";
import {
  filterResultsOutsideStdDeviations,
  parseRunResultsFile,
} from "../data/ResultsFile";
import { MetricEnum } from "../data/MetricEnum";

export function getBaseName(file: string): string {
  return path.basename(file, ".csv").replace("_verbose_metrics", "");
}

export function applyTrimPrefix(
  result: { fileName: string },
  trimPrefix: string,
): void {
  if (trimPrefix && result.fileName.startsWith(trimPrefix)) {
    result.fileName = result.fileName.slice(trimPrefix.length);
  }
}

export async function loadRunFilters(
  aggregateFile: string,
  stddevFilter: number,
): Promise<Map<string, Set<number>>> {
  if (!aggregateFile) return new Map();

  console.log(`Parsing run results file: ${aggregateFile}`);
  const results = await parseRunResultsFile(aggregateFile);
  const filteredResults = filterResultsOutsideStdDeviations(
    results,
    stddevFilter,
  );

  for (const filter of filteredResults) {
    if (filter.remove.length === 0) continue;

    console.log(
      `Removing ${filter.remove.length} out of ${filter.keep.length + filter.remove.length} run(s) from ${filter.saveName}`,
    );
    for (const row of filter.remove) {
      console.log(
        `- Removing ${row.save_name} run index ${row.run_index} with avg_ms ${row.avg_ms}`,
      );
    }
  }

  return new Map(
    filteredResults.map((f) => [
      f.saveName,
      new Set(f.remove.map((r) => r.run_index)),
    ]),
  );
}

// Common options for all chart types
export function addBaseOptions(command: Command): Command {
  return command
    .argument(
      "<glob-pattern>",
      "Glob pattern for CSV files (e.g. './data/*.csv')",
    )
    .option("-o, --output <file>", "Output file path", "verbose_metrics.png")
    .option(
      "-w, --width <px>",
      "Chart width in pixels",
      (it: string) => parseInt(it),
      1400,
    )
    .option(
      "-h, --height <px>",
      "Chart height in pixels",
      (it: string) => parseInt(it),
      800,
    )
    .option(
      "--remove-first-ticks <number>",
      "Remove the first N ticks from the data (to ignore initialization spikes)",
      (it: string) => parseInt(it),
      3600,
    )
    .option(
      "--max-ticks <number>",
      "Max tick to include in charts",
      (it: string) => parseInt(it),
      0,
    )
    .option(
      "--trim-prefix <string>",
      "Trim the prefix of the map name",
      (it: string) => it,
      "",
    )
    .option(
      "--aggregate-file <string>",
      "Path to aggregate run results file",
      (it: string) => it,
      "",
    )
    .option(
      "--stddev-filter <number>",
      "Number of standard deviations to use for filtering run results",
      (it: string) => Number(it),
      3,
    )
    .option<MetricEnum[]>(
      "--metrics <string>",
      "Comma separated list of specific metrics to use (default: *)",
      (it: string) => {
        if (it == "*") {
          return MetricRegistryInstance.all();
        }

        return it
          .split(",")
          .map((metricName) => MetricRegistryInstance.getOrThrow(metricName));
      },
      MetricRegistryInstance.all(),
    );
}

// Aggregate strategy option used by multiple chart types
export function addAggregateStrategyOption(command: Command): Command {
  return command.option(
    "-a, --aggregate-strategy <average | minimum | maximum | median | standard_deviation>",
    "Aggregate the runs by either minimum per tick or average per tick",
    "average",
  );
}
