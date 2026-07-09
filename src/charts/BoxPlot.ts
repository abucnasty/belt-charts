import { ChartConfiguration } from "chart.js";
import { colors, chartLayout } from "./constants";
import { backgroundPlugin } from "./plugins";
import { MetricEnum } from "../data/MetricEnum";
import { average, max, median, milliToMicro, min, nanoToMicro, roundTo } from "../utils";
import { AggregationStrategy } from "../data/AggregationStrategy";
import { IBoxPlot } from "@sgratzl/chartjs-chart-boxplot";
import { BenchmarkAggregateRunResult } from "../data/BenchmarkAggregateResult";

export interface BoxChartOptions {
    /**
     * time in milliseconds
     */
    maxUpdateTime: number | null;
    /**
     * time in milliseconds
     */
    minUpdateTime: number | null;
}

export const createBoxPlotChartConfiguration = (results: BenchmarkAggregateRunResult[], options: BoxChartOptions): ChartConfiguration<"boxplot"> => {

    const dataSets: { displayName: string, stats: IBoxPlot }[] = []

    results.forEach(result => {
        const displayName = result.displayName

        const valuesPerRun: number[] = []

        const wholeUpdateRunAggregates = result.runs.get(MetricEnum.WHOLE_UPDATE.name)!

        wholeUpdateRunAggregates.forEach(aggregate => {
            valuesPerRun.push(nanoToMicro(aggregate.average))
        })

        valuesPerRun.sort((a, b) => a - b)

        const medianValue = median(valuesPerRun)
        const stats: IBoxPlot = {
            min: min(valuesPerRun),
            q1: median(valuesPerRun.filter(it => it <= medianValue)),
            median: medianValue,
            q3: median(valuesPerRun.filter(it => it >= medianValue)),
            max: max(valuesPerRun),
            whiskerMax: max(valuesPerRun),
            whiskerMin: min(valuesPerRun),
            mean: average(valuesPerRun),
            items: valuesPerRun,
            outliers: []
        }

        dataSets.push({
            displayName: displayName,
            stats
        })
    })

    const axisLabel = `Whole Update Time [microseconds] (lower is better)`

    const title = `Whole Update Time Run Variance`

    dataSets.sort((a, b) => b.stats.mean - a.stats.mean)

    const minimum = options.minUpdateTime !== null ? milliToMicro(options.minUpdateTime) : min(dataSets.map(it => it.stats.min)) * chartLayout.AXIS_SCALE_LOWER_PADDING
    const maximum = options.maxUpdateTime !== null ? milliToMicro(options.maxUpdateTime) : max(dataSets.map(it => it.stats.max)) * chartLayout.AXIS_SCALE_UPPER_PADDING

    return {
        type: "boxplot",
        options: {
            backgroundColor: colors.black,
            plugins: {
                title: {
                    display: true,
                    text: title,
                    color: colors.white,
                    font: {
                        size: 18
                    },
                    padding: {
                        top: 10,
                        bottom: 30
                    }
                },
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    stacked: true,
                    ticks: { color: colors.white, maxRotation: 80, minRotation: 45 },
                    grid: {
                        color: colors.dark_grey
                    },
                },
                y: {
                    stacked: true,
                    ticks: { color: colors.white, },
                    title: {
                        display: true,
                        color: colors.white,
                        text: axisLabel,
                        font: {
                            size: 14
                        }
                    },
                    min: roundTo(minimum, 1),
                    max: roundTo(maximum, 1),
                    grid: {
                        color: colors.dark_grey,
                        tickBorderDash: [8, 4]
                    }
                },
            },
        },
        data: {
            labels: dataSets.map(it => it.displayName),
            datasets: [
                {
                    label: 'Dataset 1',
                    borderWidth: 1,
                    itemRadius: 1,
                    itemBackgroundColor: colors.sky_blue,
                    backgroundColor: colors.white,
                    borderColor: colors.sky_blue,
                    data: dataSets.map(it => it.stats)
                },
            ],
        },
        plugins: [backgroundPlugin]
    };
}