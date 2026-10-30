import path from "path";
import { MetricName } from "./Metric";
import { MetricEnum } from "./MetricEnum";
import { metricsFromColumns } from "./BenchmarkTickResult";
import { createObjectCsvWriter } from "csv-writer"
import { AggregationStrategy } from "./AggregationStrategy";
import { readCsv } from "./csvReader";
import { MetricSamples } from "./MetricSamples";

export type MetricAggregate = {
    average: number; // in nanoseconds
    standardDeviation: number; // in nanoseconds
    minimum: number; // in nanoseconds
    maximum: number;
    median: number; // in nanoseconds
}

export type MetricRunAggregate = MetricAggregate & {
    run: number
}

export interface BenchmarkAggregateRunResult {
    /** Immutable base name of the source CSV (filename minus `.csv` / `_verbose_metrics`). Set once at parse time and preserved through all label transforms. Used for lookups against `--name` / `--names-file` and `--group-by`. */
    originalFileName: string;
    /** Transformed label shown in charts and tables. Modified by the label pipeline (`--name`, `--trim-prefix`, `--trim-substring`, `--title-case`) and the per-run explosion (`(run N)` suffix). */
    displayName: string;
    /** Optional group key set by the command layer for chart clustering. Carried through label transforms via object spread. */
    group?: string;
    metrics: MetricEnum[]
    runs: Map<MetricName, MetricRunAggregate[]>
    all: Map<MetricName, MetricAggregate>
}

export type RunValue = {
    value: number
    run: number
}

export const parseBenchmarkAggregatesPerRunResultFromCsv = async (
    filePath: string,
    removeFirstTicks: number = 0,
    maxTick: number,
    metrics: MetricEnum[],
    runsToRemove: Set<number>
): Promise<BenchmarkAggregateRunResult> => {
    const baseName = path.basename(filePath, ".csv").replace("_verbose_metrics", "");
    // Samples per run, indexed in the same order as `metrics`.
    const samplesPerRun: Map<number, MetricSamples[]> = new Map()

    console.log(`Parsing benchmark aggregate run results from CSV file: ${filePath} removing the first ${removeFirstTicks} ticks`)

    await readCsv(filePath, (columns) => {
        if (metrics.length === 0) {
            metrics = metricsFromColumns(columns, filePath);
        }
        // lastIndexOf: on duplicate column names the last one wins, as with keyed rows.
        const runIndex = columns.lastIndexOf("run");
        const tickIndex = columns.lastIndexOf("tick");
        const wholeUpdateIndex = columns.lastIndexOf(MetricEnum.WHOLE_UPDATE.name);
        const metricIndices = metrics.map(metric => columns.lastIndexOf(metric.name));

        return (fields) => {
            const run = Number(fields[runIndex])
            if (runsToRemove.has(run)) {
                return
            }
            const tick = Number(fields[tickIndex])
            if (tick <= removeFirstTicks) {
                return
            }
            if (maxTick > 0 && tick > maxTick) {
                return
            }
            if (fields[wholeUpdateIndex] == undefined) {
                throw new Error("Expected 'wholeUpdate' column to be present in the CSV");
            }

            let runSamples = samplesPerRun.get(run);
            if (runSamples === undefined) {
                runSamples = metrics.map(() => new MetricSamples());
                samplesPerRun.set(run, runSamples);
            }
            for (let i = 0; i < metrics.length; i++) {
                const rawValue = Number(fields[metricIndices[i]]);
                runSamples[i].push(isNaN(rawValue) ? 0 : rawValue);
            }
        };
    });

    const runAggregates: Map<MetricName, MetricRunAggregate[]> = new Map()
    metrics.forEach(metric => {
        runAggregates.set(metric.name, [])
    })

    if (samplesPerRun.size === 0) {
        throw new Error("No data found in the CSV file after applying filters. Please check the file and the provided parameters.");
    }

    for (const [run, runSamples] of samplesPerRun) {
        metrics.forEach((metric, i) => {
            runAggregates.get(metric.name)!.push({
                ...runSamples[i].aggregate(),
                run: run
            })
        })
    }

    const all: Map<MetricName, MetricAggregate> = new Map()

    metrics.forEach((metric, i) => {
        const allRuns = MetricSamples.merge([...samplesPerRun.values()].map(runSamples => runSamples[i]))
        all.set(metric.name, allRuns.aggregate())
    })

    return {
        originalFileName: baseName,
        displayName: baseName,
        metrics,
        runs: runAggregates,
        all: all
    };
}


export const saveBenchmarkAggregateRunResultsToCsv = async (results: BenchmarkAggregateRunResult[], aggregationStrategy: AggregationStrategy, path: string): Promise<void> => {
    const allMetricNames = Array.from(
        new Set(results.flatMap(r => r.metrics.map(m => m.name)))
    );

    // Prepare CSV header for csv-writer
    const header = [
        { id: "fileName", title: "fileName" },
        { id: "run", title: "run" },
        ...allMetricNames.flatMap(metric => {
            let metricHeader = `${metric}`
            switch (aggregationStrategy) {
                case AggregationStrategy.AVERAGE:
                    metricHeader = `${metric}_average`
                    break;
                case AggregationStrategy.MINIMUM:
                    metricHeader = `${metric}_minimum`
                    break;
                case AggregationStrategy.MAXIMUM:
                    metricHeader = `${metric}_maximum`
                    break;
                case AggregationStrategy.MEDIAN:
                    metricHeader = `${metric}_median`
                    break;
                case AggregationStrategy.STANDARD_DEVIATION:
                    metricHeader = `${metric}_standardDeviation`
                    break;
            }

            return [
                { id: metricHeader, title: metricHeader }
            ]

        })
    ];

    const records: any[] = [];
    for (const result of results) {
        const runsSet = new Set<number>();
        result.runs.forEach(runAggregates => {
            runAggregates.forEach(agg => runsSet.add(agg.run));
        });
        const runs = Array.from(runsSet).sort((a, b) => a - b);

        for (const run of runs) {
            const record: Record<string, any> = {
                // External CSV schema keeps the `fileName` column header (backward-compatible with
                // any downstream CSV consumers); the value is sourced from originalFileName.
                fileName: result.originalFileName,
                run: run
            };
            for (const metric of allMetricNames) {
                const runAgg = result.runs.get(metric)?.find(agg => agg.run === run);

                switch (aggregationStrategy) {
                    case AggregationStrategy.AVERAGE:
                        record[`${metric}_average`] = runAgg ? runAgg.average : "";
                        break;
                    case AggregationStrategy.MINIMUM:
                        record[`${metric}_minimum`] = runAgg ? runAgg.minimum : "";
                        break;
                    case AggregationStrategy.MAXIMUM:
                        record[`${metric}_maximum`] = runAgg ? runAgg.maximum : "";
                        break;
                    case AggregationStrategy.MEDIAN:
                        record[`${metric}_median`] = runAgg ? runAgg.median : "";
                        break;
                    case AggregationStrategy.STANDARD_DEVIATION:
                        record[`${metric}_standardDeviation`] = runAgg ? runAgg.standardDeviation : "";
                        break;
                }
            }
            records.push(record);
        }
    }

    const csvWriter = createObjectCsvWriter({
        path: path,
        header: header
    });

    await csvWriter.writeRecords(records);
}

/**
 * A benchmark result scoped to a single run.
 * Produced by explodeIntoPerRunResults — the `runs` map is empty;
 * `all` holds the single run's aggregate stats.
 */
export interface SingleRunAggregateResult extends BenchmarkAggregateRunResult {
    readonly __singleRun: true;
}

/**
 * Explode a BenchmarkAggregateRunResult into an array of per-run results,
 * where each result represents a single run with its aggregate metrics.
 * The aggregation strategy determines which per-run statistic (average/median/min/max/stddev)
 * is used as the "average" field that the chart will render.
 */
export const explodeIntoPerRunResults = (
    result: BenchmarkAggregateRunResult,
    aggregationStrategy: AggregationStrategy
): SingleRunAggregateResult[] => {
    // Collect all unique run numbers
    const runsSet = new Set<number>();
    result.runs.forEach(runAggregates => {
        runAggregates.forEach(agg => runsSet.add(agg.run));
    });
    const runs = Array.from(runsSet).sort((a, b) => a - b);

    return runs.map(run => {
        const all: Map<MetricName, MetricAggregate> = new Map();

        // For each metric, extract the per-run aggregate and map it to a MetricAggregate
        result.metrics.forEach(metric => {
            const runAgg = result.runs.get(metric.name)?.find(agg => agg.run === run);
            if (runAgg) {
                // Map the chosen statistic to the "average" field based on strategy
                let averageValue: number;
                switch (aggregationStrategy) {
                    case AggregationStrategy.AVERAGE:
                        averageValue = runAgg.average;
                        break;
                    case AggregationStrategy.MINIMUM:
                        averageValue = runAgg.minimum;
                        break;
                    case AggregationStrategy.MAXIMUM:
                        averageValue = runAgg.maximum;
                        break;
                    case AggregationStrategy.MEDIAN:
                        averageValue = runAgg.median;
                        break;
                    case AggregationStrategy.STANDARD_DEVIATION:
                        averageValue = runAgg.standardDeviation;
                        break;
                    default:
                        averageValue = runAgg.average;
                }

                all.set(metric.name, {
                    average: averageValue,
                    standardDeviation: runAgg.standardDeviation,
                    minimum: runAgg.minimum,
                    maximum: runAgg.maximum,
                    median: runAgg.median,
                });
            }
        });

        return {
            // Preserve originalFileName across explosion so per-run rows can still
            // resolve customNames/runsToRemove lookups against the source CSV name.
            originalFileName: result.originalFileName,
            displayName: `${result.displayName} (run ${run})`,
            metrics: result.metrics,
            runs: new Map(), // Empty since chart only reads "all"
            all: all,
            group: result.group,
            __singleRun: true,
        } as SingleRunAggregateResult;
    });
}