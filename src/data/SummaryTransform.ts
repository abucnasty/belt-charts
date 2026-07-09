import { MetricName } from "./Metric"
import { MetricEnum } from "./MetricEnum"
import { MetricRegistryInstance } from "./MetricRegistry"
import { BenchmarkAggregateRunResult, MetricAggregate } from "./BenchmarkAggregateResult"
import { nanoToMicro } from "../utils"
import { AggregationStrategy } from "./AggregationStrategy"

export interface SummaryChartMetricValue {
  metricName: string;
  metricDescription: string;
  average: number;
  min?: number;
  max?: number;
}

export interface SummaryChartData {
  displayName: string;
  group?: string;
  totalAverage: number;
  metrics: Array<MetricEnum>;
  metricValues: SummaryChartMetricValue[];
}

export function buildSummaryChartData(
  result: BenchmarkAggregateRunResult,
  configuredMetrics: Partial<Record<MetricName, MetricEnum>>,
  _aggregationStrategy: AggregationStrategy,
): SummaryChartData {
  const metrics = result.metrics;

  let include_other = true;
  if (configuredMetrics[MetricEnum.HEAT_NETWORK_UPDATE.name] || configuredMetrics[MetricEnum.FLUID_FLOW_UPDATE.name]) {
    // other is not computable if these metrics are included since they are part of the electricHeatFluidCircuitUpdate metric
    include_other = false;
  }

  const otherMetricAverages = metrics
    .filter(it => it.name !== MetricEnum.WHOLE_UPDATE.name)
    .filter(it => configuredMetrics[it.name] != undefined)
    .filter(it => it.name !== MetricEnum.OTHER.name)
    .flatMap(metric => {
      const metricAggregate: MetricAggregate | undefined = result.all.get(metric.name);
      if (!metricAggregate) {
        return [];
      }
      return [{
        metricName: metric.name,
        metricDescription: metric.description,
        average: nanoToMicro(metricAggregate.average),
        min: nanoToMicro(metricAggregate.minimum),
        max: nanoToMicro(metricAggregate.maximum),
      }];
    })
    .sort((a, b) => b.average - a.average);

  const sumOfParts = otherMetricAverages.reduce((sum, m) => sum + m.average, 0);

  const wholeUpdateAgg: MetricAggregate | undefined = result.all.get(MetricEnum.WHOLE_UPDATE.name);
  const metricValues: SummaryChartMetricValue[] = [...otherMetricAverages];

  if (!wholeUpdateAgg) {
    return {
      displayName: result.displayName,
      group: result.group,
      metrics: metricValues.map(it => MetricRegistryInstance.getOrThrow(it.metricName)),
      metricValues,
      totalAverage: sumOfParts,
    };
  }

  const wholeUpdateAverage = nanoToMicro(wholeUpdateAgg.average);
  const otherAvg = wholeUpdateAverage - sumOfParts;

  if (include_other) {
    metricValues.push({
      metricName: MetricEnum.OTHER.name,
      metricDescription: MetricEnum.OTHER.description,
      average: otherAvg,
    });
  }

  metricValues.push({
    metricName: MetricEnum.WHOLE_UPDATE.name,
    metricDescription: MetricEnum.WHOLE_UPDATE.description,
    average: wholeUpdateAverage,
    min: nanoToMicro(wholeUpdateAgg.minimum),
    max: nanoToMicro(wholeUpdateAgg.maximum),
  });

  return {
    displayName: result.displayName,
    group: result.group,
    metrics: metricValues.map(it => MetricRegistryInstance.getOrThrow(it.metricName)),
    metricValues,
    totalAverage: wholeUpdateAverage,
  };
}
