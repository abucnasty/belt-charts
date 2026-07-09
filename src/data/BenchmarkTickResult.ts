import path from "path";
import { MetricName } from "./Metric";
import { MetricRegistryInstance } from "./MetricRegistry";
import { average, max, median, min, standardDeviation } from "../utils";
import { MetricEnum } from "./MetricEnum";
import { AggregationStrategy } from "./AggregationStrategy";
import { readCsvRows } from "./csvReader";

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

export const parseBenchmarkAveragePerTickResultFromCsv = async (filePath: string, runResultsToRemove: Set<number>): Promise<BenchmarkTickResult> => {
    const baseName = path.basename(filePath, ".csv").replace("_verbose_metrics", "");
    let metrics: MetricEnum[] = [];
    const rawResultsPerTick: Map<number, BenchmarkResultRaw[]> = new Map();

    await readCsvRows<BenchmarkResultRaw>(filePath, (row) => {
                const run = Number(row.run);
                if (runResultsToRemove.has(run)) {
                    return
                }
                const tick = Number(row.tick);

                if (metrics.length === 0) {
                    metrics = Object.keys(row)
                        .filter(it => it !== "tick" && it !== "run")
                        .filter(it => `${it}`.length > 0)
                        .flatMap(metricName => {
                            const metric = MetricRegistryInstance.get(metricName as MetricName);
                            if (!metric) {
                                console.warn(`Unknown metric column "${metricName}" in ${filePath} - skipping`);
                                return [];
                            }
                            return [metric];
                        });
                }
                const wholeUpdate = row[MetricEnum.WHOLE_UPDATE.name];
                if (wholeUpdate == undefined) {
                    throw new Error("Expected 'wholeUpdate' column to be present in the CSV");
                }
                if (!rawResultsPerTick.has(tick)) {
                    rawResultsPerTick.set(tick, [row]);
                } else {
                    rawResultsPerTick.get(tick)!.push(row);
                }
    });

    const metricStats: Map<MetricName, MetricTickStat[]> = new Map(metrics.map(it => [it.name, []]));

    rawResultsPerTick.forEach((rows, tick) => {
        metrics.forEach(metric => {
            const rawMetricValues = rows.map(row => Number(row[metric.name]));
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