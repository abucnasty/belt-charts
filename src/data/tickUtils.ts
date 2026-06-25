import { average } from "../utils";
import { BenchmarkTickResult, MetricTickStat, MetricValue } from "./BenchmarkTickResult";
import { MetricName } from "./Metric";

export interface BenchmarkAggregate {
    run: number;
    data: Map<MetricName, number>;
}

export const ignoreFirstTicksFromResult = (result: BenchmarkTickResult, ticksToIgnore: number): BenchmarkTickResult => {
    const filteredMetricValues: Map<MetricName, MetricTickStat[]> = new Map();
    result.metricTickStats.forEach((values, metricName) => {
        filteredMetricValues.set(metricName, values.filter(v => v.tick > ticksToIgnore));
    });
    return {
        ...result,
        metricTickStats: filteredMetricValues
    }
}

export const metricValueAverage = (values: Array<MetricValue>): number => {
    return average(values.map(v => v.value));
}