import path from "path";
import { MetricName } from "./Metric";
import { MetricRegistryInstance } from "./MetricRegistry";
import { average, max, median, min, standardDeviation } from "../utils";
import { MetricEnum } from "./MetricEnum";
import { BenchmarkResultRaw } from "./BenchmarkTickResult";
import { createObjectCsvWriter } from "csv-writer"
import { AggregationStrategy } from "./AggregationStrategy";
import { readCsvRows } from "./csvReader";

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
    fileName: string;
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
    const runValuesPerMetric: Map<number, Partial<Record<MetricName, RunValue[]>>> = new Map()

    console.log(`Parsing benchmark aggregate run results from CSV file: ${filePath} removing the first ${removeFirstTicks} ticks`)

    await readCsvRows<BenchmarkResultRaw>(filePath, (row) => {
                const run = Number(row.run)
                if (runsToRemove.has(run)) {
                    return
                }
                if (metrics.length === 0) {
                    metrics = Object.keys(row)
                        .filter(it => it !== "tick" && it !== "run")
                        .filter(it => `${it}`.length > 0)
                        .map(metricName => MetricRegistryInstance.getOrThrow(metricName));
                }
                if (Number(row.tick) <= removeFirstTicks) {
                    return
                }

                if (maxTick > 0 && Number(row.tick) > maxTick) {
                    return
                }

                if (runValuesPerMetric.get(run) === undefined) {
                    const metricToRunValues: Partial<Record<MetricName, RunValue[]>> = {};
                    metrics.forEach(metric => {
                        metricToRunValues[metric.name] = [];
                    });
                    runValuesPerMetric.set(run, metricToRunValues);
                }

                const wholeUpdate = row[MetricEnum.WHOLE_UPDATE.name];
                if (wholeUpdate == undefined) {
                    throw new Error("Expected 'wholeUpdate' column to be present in the CSV");
                }

                const runEntry = runValuesPerMetric.get(run)!;
                metrics.forEach(metric => {
                    runEntry[metric.name]!.push({
                        value: Number(row[metric.name]),
                        run: Number(row.run)
                    });
                });
    });


    const runAggregates: Map<MetricName, MetricRunAggregate[]> = new Map()
    metrics.forEach(metric => {
        runAggregates.set(metric.name, [])
    })

    if (runValuesPerMetric.size === 0) {
        throw new Error("No data found in the CSV file after applying filters. Please check the file and the provided parameters.");
    }

    for (const [run, metricToRunValues] of runValuesPerMetric) {
        metrics.forEach(metric => {
            const rawValues = metricToRunValues[metric.name]!.map(it => it.value)
            runAggregates.get(metric.name)!.push({
                average: average(rawValues),
                standardDeviation: standardDeviation(rawValues),
                minimum: min(rawValues),
                maximum: max(rawValues),
                median: median(rawValues),
                run: run
            })
        })
    }

    const all: Map<MetricName, MetricAggregate> = new Map()

    metrics.forEach(metric => {
        const metricRawValues: number[] = []
        runValuesPerMetric.forEach((metricToRunValues) => {
            metricToRunValues[metric.name]!.forEach(it => {
                metricRawValues.push(it.value)
            })
        })
        all.set(metric.name, {
            average: average(metricRawValues),
            standardDeviation: standardDeviation(metricRawValues),
            minimum: min(metricRawValues),
            maximum: max(metricRawValues),
            median: median(metricRawValues),
        })
    })

    return {
        fileName: baseName,
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
                fileName: result.fileName,
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
            fileName: `${result.fileName} run ${run}`,
            metrics: result.metrics,
            runs: new Map(), // Empty since chart only reads "all"
            all: all,
            __singleRun: true,
        } as SingleRunAggregateResult;
    });
}