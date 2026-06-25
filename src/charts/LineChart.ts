import assert from "assert";
import { metricValueAverage } from "../data/tickUtils"
import { BenchmarkTickResult, MetricValue, transformResultToMetricValues } from "../data/BenchmarkTickResult"
import { AggregationStrategy } from "../data/AggregationStrategy"
import { MetricName } from "../data/Metric"
import { MetricEnum } from "../data/MetricEnum"
import { MetricRegistryInstance, MetricProfiles, toMetricRecord } from "../data/MetricRegistry"
import { nanoToMicro, timeWeightedAverageByChunks } from "../utils"
import { colors, chartLayout } from "./constants"
import { backgroundPlugin } from "./plugins";
import type { ChartConfiguration } from "chart.js";
import { getMetricColor } from "./styles";


const supportedMetrics = toMetricRecord(MetricProfiles.LINE_CHART);

export interface LineChartOptions {
    maxTicks: number,
    maxUpdateValue: number,
    type: "bar" | "line",
    aggregationStrategy: AggregationStrategy,
    tickWindow?: number,
    /** Metrics to render as stacked areas. When omitted the default top-level set is used. */
    metrics?: MetricEnum[],
}

const autoTickWindow = (maxTick: number): number => {

    const second = chartLayout.TICKS_PER_SECOND;
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

    const datasets: any[] = []

    const resultMetricValues = transformResultToMetricValues(result, options.aggregationStrategy)

    const filteredMetricValueMap: Map<MetricName, MetricValue[]> = new Map();

    let maxTicks = options.maxTicks

    if (maxTicks === 0) {
        const wholeUpdateValues = resultMetricValues.get(MetricEnum.WHOLE_UPDATE.name)
        assert(wholeUpdateValues !== undefined, "No WHOLE_UPDATE metric values found")
        // assume sorted
        maxTicks = wholeUpdateValues[wholeUpdateValues.length - 1].tick
    }

    // Use caller-supplied metrics if provided; fall back to the default top-level set.
    // wholeUpdate is always excluded from stacked areas (it becomes the dashed reference line).
    // entityUpdate is also excluded from stacked areas when entity children are present —
    // in that case entityUpdate itself becomes the reference line ("Total Entity Update Average").
    const rawDisplayMetrics: Partial<Record<MetricName, MetricEnum>> = options.metrics
        ? Object.fromEntries(
            options.metrics
                .filter(m => m.name !== MetricEnum.WHOLE_UPDATE.name)
                .map(m => [m.name, m])
          )
        : supportedMetrics;

    // Detect entity-breakdown mode: any metric whose parent is entityUpdate.
    const entityBreakdownMode = Object.values(rawDisplayMetrics).some(
        m => m !== undefined && (MetricRegistryInstance.get(m.name) as { parent?: string })?.parent === MetricEnum.ENTITY_UPDATE.name
    );

    // In entity-breakdown mode remove the entityUpdate parent from the stacked display
    // so we don't double-count it; it becomes the reference line instead.
    const displayMetrics: Partial<Record<MetricName, MetricEnum>> = entityBreakdownMode
        ? Object.fromEntries(
            Object.entries(rawDisplayMetrics).filter(([name]) => name !== MetricEnum.ENTITY_UPDATE.name)
          )
        : rawDisplayMetrics;

    let firstDatasetPoints: { x: number; y: number }[] | undefined;

    result.metrics.filter(it => displayMetrics[it.name] !== undefined).forEach(metric => {
        const metricValues = resultMetricValues.get(metric.name)!
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


    result.metrics.filter(it => displayMetrics[it.name] !== undefined).forEach(metric => {

        const data = filteredMetricValueMap.get(metric.name)!.filter(it => it.tick <= maxTicks).map(it => ({ x: it.tick, y: nanoToMicro(it.value) }));
        // sort by tick ascending
        data.sort((a, b) => a.x - b.x);
        if (!firstDatasetPoints) firstDatasetPoints = data;

        // Skip metrics that are entirely zero — they add a legend entry but no visual.
        if (data.every(pt => pt.y === 0)) return;

        datasets.push({
            label: metric.name,
            data: data,
            backgroundColor: getMetricColor(metric.name),
            borderColor: getMetricColor(metric.name),
            fill: true,
            cubicInterpolationMode: "monotone",
        })
    })

    const wholeUpdateAverage = nanoToMicro(metricValueAverage(resultMetricValues.get(MetricEnum.WHOLE_UPDATE.name)!))

    assert(firstDatasetPoints !== undefined, "No supported metric datasets were created")

    // In entity-breakdown mode the reference line is the entityUpdate average;
    // otherwise it is the wholeUpdate average (standard behaviour).
    let referenceAverage: number;
    let referenceLabel: string;
    if (entityBreakdownMode) {
        const entityUpdateValues = resultMetricValues.get(MetricEnum.ENTITY_UPDATE.name);
        assert(entityUpdateValues !== undefined, "No ENTITY_UPDATE metric values found for entity breakdown timeseries");
        referenceAverage = nanoToMicro(metricValueAverage(entityUpdateValues));
        referenceLabel = "Total Entity Update Average";
    } else {
        referenceAverage = wholeUpdateAverage;
        referenceLabel = "Whole Update Average";
    }

    datasets.push({
        type: "line" as const,
        label: referenceLabel,
        data: firstDatasetPoints!.map(it => ({
            x: it.x,
            y: referenceAverage
        })),
        borderColor: colors.white,
        borderWidth: 4,
        borderDash: [6, 1]
    })

    const ticks = firstDatasetPoints.map(it => it.x)
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