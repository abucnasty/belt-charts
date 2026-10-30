import path from "path";
import { MetricName } from "./Metric";
import { MetricRegistryInstance } from "./MetricRegistry";
import { average, max, median, min, standardDeviation } from "../utils";
import { MetricEnum } from "./MetricEnum";
import { AggregationStrategy } from "./AggregationStrategy";
import { readCsv } from "./csvReader";

export type BenchmarkResultRaw = Record<MetricName, number> & {
    tick: number;
    run: number;
}

export type RunValue = {
    run: number
    value: number
}

export interface MetricValue {
    value: number; // in nanoseconds
    tick: number;
}

export interface MetricTickStat {
    average: number; // in nanoseconds
    standardDeviation: number; // in nanoseconds
    minimum: number; // in nanoseconds
    maximum: number;
    median: number; // in nanoseconds
    tick: number;
}

export interface BenchmarkTickResult {
    /** Immutable base name of the source CSV. Set once at parse time and preserved through label transforms. */
    originalFileName: string;
    /** Transformed label shown in charts. Modified by the label pipeline. */
    displayName: string;
    metrics: MetricEnum[]
    metricTickStats: Map<MetricName, MetricTickStat[]>
}

export const transformResultToMetricValues = (result: BenchmarkTickResult, strategy: AggregationStrategy): Map<MetricName, MetricValue[]> => {
    const map: Map<MetricName, MetricValue[]> = new Map()

    result.metricTickStats.forEach((stats, metricName) => {
        map.set(metricName, stats.map(stat => transformMetricTickStatToMetricValue(stat, strategy)))
    })

    return map;
}

export const transformMetricTickStatToMetricValue = (metricTickStat: MetricTickStat, strategy: AggregationStrategy): MetricValue => {
    let value: number = 0;
    switch (strategy) {
        case AggregationStrategy.AVERAGE:
            value = metricTickStat.average;
            break;
        case AggregationStrategy.MINIMUM:
            value = metricTickStat.minimum;
            break;
        case AggregationStrategy.MAXIMUM:
            value = metricTickStat.maximum;
            break;
        case AggregationStrategy.MEDIAN:
            value = metricTickStat.median;
            break;
        case AggregationStrategy.STANDARD_DEVIATION:
            value = metricTickStat.standardDeviation;
            break;
    }

    return {
        value: value,
        tick: metricTickStat.tick
    }
}

/** Maps CSV header columns to known metrics, skipping `tick`/`run`, blank and unrecognised columns. */
export const metricsFromColumns = (columns: string[], filePath: string): MetricEnum[] =>
    columns
        .filter(it => it !== "tick" && it !== "run")
        .filter(it => it.length > 0)
        .flatMap(metricName => {
            const metric = MetricRegistryInstance.get(metricName as MetricName);
            if (!metric) {
                console.warn(`Unknown metric column "${metricName}" in ${filePath} - skipping`);
                return [];
            }
            return [metric];
        });

export const parseBenchmarkAveragePerTickResultFromCsv = async (
    filePath: string,
    runResultsToRemove: Set<number>,
    maxTicks?: number,
    metricNames?: Set<MetricName>,
): Promise<BenchmarkTickResult> => {
    const baseName = path.basename(filePath, ".csv").replace("_verbose_metrics", "");
    let metrics: MetricEnum[] = [];
    // Only the selected metric values are kept per tick, flattened as [run0 m0..mN, run1 m0..mN, ...].
    // Retaining whole parsed rows (every CSV column, as strings) exhausts the heap on large files.
    const valuesPerTick: Map<number, number[]> = new Map();

    await readCsv(filePath, (columns) => {
        // Only keep columns actually needed for this chart - CSVs can have 100+
        // metric columns, and building/serializing stats for all of them across
        // a worker-thread boundary can exhaust the main thread's heap.
        metrics = metricsFromColumns(
            columns.filter(it => metricNames === undefined || metricNames.has(it as MetricName) || it === MetricEnum.WHOLE_UPDATE.name),
            filePath,
        );
        const runIndex = columns.lastIndexOf("run");
        const tickIndex = columns.lastIndexOf("tick");
        const wholeUpdateIndex = columns.lastIndexOf(MetricEnum.WHOLE_UPDATE.name);
        const metricIndices = metrics.map(metric => columns.lastIndexOf(metric.name));

        return (fields) => {
            const run = Number(fields[runIndex]);
            if (runResultsToRemove.has(run)) {
                return
            }
            const tick = Number(fields[tickIndex]);
            // 0 means "no limit", matching --max-ticks.
            if (maxTicks !== undefined && maxTicks > 0 && tick > maxTicks) {
                return
            }
            if (fields[wholeUpdateIndex] == undefined) {
                throw new Error("Expected 'wholeUpdate' column to be present in the CSV");
            }
            let tickValues = valuesPerTick.get(tick);
            if (tickValues === undefined) {
                tickValues = [];
                valuesPerTick.set(tick, tickValues);
            }
            for (const index of metricIndices) {
                tickValues.push(Number(fields[index]));
            }
        };
    });

    const metricStats: Map<MetricName, MetricTickStat[]> = new Map(metrics.map(it => [it.name, []]));

    valuesPerTick.forEach((tickValues, tick) => {
        metrics.forEach((metric, metricIndex) => {
            const rawMetricValues: number[] = [];
            for (let i = metricIndex; i < tickValues.length; i += metrics.length) {
                rawMetricValues.push(tickValues[i]);
            }
            metricStats.get(metric.name)!.push({
                average: average(rawMetricValues),
                standardDeviation: standardDeviation(rawMetricValues),
                minimum: min(rawMetricValues),
                maximum: max(rawMetricValues),
                median: median(rawMetricValues),
                tick: Number(tick),
            });
        })
    })

    return {
        originalFileName: baseName,
        displayName: baseName,
        metrics,
        metricTickStats: metricStats
    };
}

/**
 * Scans a CSV for the max raw value of a metric without retaining per-tick data,
 * so multiple files can be pre-scanned for a shared chart max without holding them all in memory.
 */
export const computeMaxMetricValueFromCsv = async (
    filePath: string,
    runResultsToRemove: Set<number>,
    metricName: MetricName,
    ticksToIgnore: number,
): Promise<number> => {
    let maxValue = -Infinity;

    await readCsv(filePath, (columns) => {
        const runIndex = columns.lastIndexOf("run");
        const tickIndex = columns.lastIndexOf("tick");
        const metricIndex = columns.lastIndexOf(metricName);
        return (fields) => {
            const run = Number(fields[runIndex]);
            if (runResultsToRemove.has(run)) {
                return
            }
            const tick = Number(fields[tickIndex]);
            if (ticksToIgnore > 0 && tick <= ticksToIgnore) {
                return
            }
            const value = Number(fields[metricIndex]);
            if (value > maxValue) {
                maxValue = value;
            }
        };
    });

    return maxValue;
}