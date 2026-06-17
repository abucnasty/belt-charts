import assert from "assert";
import { metricValueAverage } from "../data/BenchmarkAggregates"
import { BenchmarkTickResult, MetricValue, transformResultToMetricValues } from "../data/BenchmarkTickResult"
import { AggregationStrategy } from "../data/AggregationStrategy"
import { MetricName } from "../data/Metric"
import { MetricEnum } from "../data/MetricEnum"
import { MetricProfiles, toMetricRecord } from "../data/MetricRegistry"
import { nanoToMicro, timeWeightedAverageByChunks } from "../utils"
import { colors } from "./constants"
import { backgroundPlugin } from "./plugins";
import type { ChartConfiguration } from "chart.js";
import { getMetricColor } from "./styles";


const supportedMetrics = toMetricRecord(MetricProfiles.LINE_CHART);

export interface LineChartOptions {
    maxTicks: number,
    maxUpdateValue: number,
    type: "bar" | "line",
    aggregationStrategy: AggregationStrategy,
    tickWindow?: number
}

const autoTickWindow = (maxTick: number): number => {

    const second = 60;
    const minute = second * 60

    if (maxTick >= minute) {
        return second
    }

    if (maxTick >= 5 * minute) {
        return 15 * second
    }

    if (maxTick >= 10 * minute) {
        return 30 * second
    }

    return 0
}

export const createLineChartForMetrics = (result: BenchmarkTickResult, options: LineChartOptions): ChartConfiguration<"bar" | "line"> => {

    const datasets = []

    const resultMetricValues = transformResultToMetricValues(result, options.aggregationStrategy)

    const filteredMetricValueMap: Map<MetricName, MetricValue[]> = new Map();

    let maxTicks = options.maxTicks

    if (maxTicks === 0) {
        const wholeUpdateValues = resultMetricValues.get(MetricEnum.WHOLE_UPDATE.name)
        assert(wholeUpdateValues !== undefined, "No WHOLE_UPDATE metric values found")
        // assume sorted
        maxTicks = wholeUpdateValues[wholeUpdateValues.length - 1].tick
    }

    result.metrics.filter(it => supportedMetrics[it.name] !== undefined).forEach(metric => {
        const metricValues = resultMetricValues.get(metric.name)
            .filter(it => it.tick <= maxTicks)
        filteredMetricValueMap.set(metric.name, metricValues)
    })

    const tickAggregationWindow = options.tickWindow || autoTickWindow(maxTicks)

    if (tickAggregationWindow > 0) {
        filteredMetricValueMap.forEach((metricValues, metricName) => {
            const timeWeightedAverages: MetricValue[] = timeWeightedAverageByChunks(metricValues, tickAggregationWindow)
            filteredMetricValueMap.set(metricName, timeWeightedAverages)
        })
    }


    result.metrics.filter(it => supportedMetrics[it.name] !== undefined).forEach(metric => {

        const data = filteredMetricValueMap.get(metric.name).filter(it => it.tick <= maxTicks).map(it => ({ x: it.tick, y: nanoToMicro(it.value) }));
        // sort by tick ascending
        data.sort((a, b) => a.x - b.x);
        datasets.push({
            label: metric.name,
            data: data,
            backgroundColor: getMetricColor(metric.name),
            borderColor: getMetricColor(metric.name),
            fill: true,
            cubicInterpolationMode: "monotone",
        })
    })

    const wholeUpdateAverage = nanoToMicro(metricValueAverage(resultMetricValues.get(MetricEnum.WHOLE_UPDATE.name)))

    datasets.push({
        type: "line",
        label: "Whole Update Average",
        data: datasets[0].data.map(it => ({
            x: it.x,
            y: wholeUpdateAverage
        })),
        borderColor: colors.white,
        borderWidth: 4,
        borderDash: [6, 1]
    })

    const ticks = datasets[0].data.map(it => it.x)
    // sort by tick ascending
    ticks.sort((a, b) => a - b);

    return {
        type: options.type,
        data: {
            labels: ticks,
            datasets: datasets
        },
        options: {
            maintainAspectRatio: false,
            scales: {
                x: {
                    stacked: true,
                    position: 'bottom',
                    title: {
                        display: true,
                        text: 'Tick'
                    },
                    ticks: {
                        color: 'white'
                    },
                },
                y: {
                    stacked: true,
                    title: {
                        display: true,
                        text: 'Time [microseconds] (lower is better)'
                    },
                    ticks: {
                        color: 'white'
                    },
                    min: 0,
                    max: options.maxUpdateValue,
                    grid: {
                        color: colors.white
                    }
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: result.fileName + " Timeseries Metrics",
                    color: colors.white,
                },
                legend: {
                    labels: {
                        color: 'white'
                    }
                }
            },
            elements: {
                line: {
                    borderColor: colors.blue,
                    borderWidth: 2,
                    fill: false,
                },
                point: {
                    radius: 0 // Hide points
                }
            }
        },
        plugins: [backgroundPlugin],
    };
}   