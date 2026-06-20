import { describe, it, expect } from "vitest";
import { buildSummaryChartData } from "../data/SummaryTransform";
import { BenchmarkAggregateRunResult, MetricAggregate } from "../data/BenchmarkAggregateResult";
import { AggregationStrategy } from "../data/AggregationStrategy";
import { MetricEnum } from "../data/MetricEnum";
import { MetricName } from "../data/Metric";

const makeAggregate = (nanos: number): MetricAggregate => ({
  average: nanos,
  standardDeviation: nanos * 0.05,
  minimum: nanos * 0.9,
  maximum: nanos * 1.1,
  median: nanos,
});

const makeResult = (
  all: Partial<Record<MetricName, MetricAggregate>>,
  metrics: MetricEnum[],
): BenchmarkAggregateRunResult => ({
  fileName: "test-map",
  metrics,
  runs: new Map(),
  all: new Map(Object.entries(all) as [MetricName, MetricAggregate][]),
});

// Configured metrics that include entity + whole (common case)
const entityAndWhole = {
  [MetricEnum.ENTITY_UPDATE.name]: MetricEnum.ENTITY_UPDATE,
  [MetricEnum.WHOLE_UPDATE.name]: MetricEnum.WHOLE_UPDATE,
};

describe("buildSummaryChartData", () => {
  it("computes 'other' as the gap between wholeUpdate and the sum of parts", () => {
    const result = makeResult(
      {
        [MetricEnum.ENTITY_UPDATE.name]: makeAggregate(5_000_000), // 5000 µs
        [MetricEnum.WHOLE_UPDATE.name]: makeAggregate(8_000_000),  // 8000 µs
      },
      [MetricEnum.ENTITY_UPDATE, MetricEnum.WHOLE_UPDATE],
    );
    const data = buildSummaryChartData(result, entityAndWhole, AggregationStrategy.AVERAGE);
    const other = data.metricValues.find(v => v.metricName === MetricEnum.OTHER.name);
    expect(other).toBeDefined();
    expect(other!.average).toBeCloseTo(3000); // 8000 - 5000 µs
  });

  it("converts nanoseconds to microseconds (÷ 1000)", () => {
    const result = makeResult(
      {
        [MetricEnum.ENTITY_UPDATE.name]: makeAggregate(1_000_000),
        [MetricEnum.WHOLE_UPDATE.name]: makeAggregate(2_000_000),
      },
      [MetricEnum.ENTITY_UPDATE, MetricEnum.WHOLE_UPDATE],
    );
    const data = buildSummaryChartData(result, entityAndWhole, AggregationStrategy.AVERAGE);
    const entity = data.metricValues.find(v => v.metricName === MetricEnum.ENTITY_UPDATE.name);
    expect(entity!.average).toBeCloseTo(1000); // 1_000_000 / 1000
  });

  it("sets totalAverage to the wholeUpdate average (in µs)", () => {
    const result = makeResult(
      {
        [MetricEnum.ENTITY_UPDATE.name]: makeAggregate(3_000_000),
        [MetricEnum.WHOLE_UPDATE.name]: makeAggregate(8_000_000),
      },
      [MetricEnum.ENTITY_UPDATE, MetricEnum.WHOLE_UPDATE],
    );
    const data = buildSummaryChartData(result, entityAndWhole, AggregationStrategy.AVERAGE);
    expect(data.totalAverage).toBeCloseTo(8000);
  });

  it("falls back to sumOfParts as totalAverage when no wholeUpdate is present", () => {
    const result = makeResult(
      { [MetricEnum.ENTITY_UPDATE.name]: makeAggregate(4_000_000) },
      [MetricEnum.ENTITY_UPDATE],
    );
    const data = buildSummaryChartData(
      result,
      { [MetricEnum.ENTITY_UPDATE.name]: MetricEnum.ENTITY_UPDATE },
      AggregationStrategy.AVERAGE,
    );
    expect(data.totalAverage).toBeCloseTo(4000);
    expect(data.metricValues.find(v => v.metricName === MetricEnum.OTHER.name)).toBeUndefined();
  });

  it("excludes 'other' when HEAT_NETWORK_UPDATE is in configuredMetrics", () => {
    const result = makeResult(
      {
        [MetricEnum.HEAT_NETWORK_UPDATE.name]: makeAggregate(1_000_000),
        [MetricEnum.WHOLE_UPDATE.name]: makeAggregate(5_000_000),
      },
      [MetricEnum.HEAT_NETWORK_UPDATE, MetricEnum.WHOLE_UPDATE],
    );
    const data = buildSummaryChartData(
      result,
      {
        [MetricEnum.HEAT_NETWORK_UPDATE.name]: MetricEnum.HEAT_NETWORK_UPDATE,
        [MetricEnum.WHOLE_UPDATE.name]: MetricEnum.WHOLE_UPDATE,
      },
      AggregationStrategy.AVERAGE,
    );
    expect(data.metricValues.find(v => v.metricName === MetricEnum.OTHER.name)).toBeUndefined();
  });

  it("excludes 'other' when FLUID_FLOW_UPDATE is in configuredMetrics", () => {
    const result = makeResult(
      {
        [MetricEnum.FLUID_FLOW_UPDATE.name]: makeAggregate(1_000_000),
        [MetricEnum.WHOLE_UPDATE.name]: makeAggregate(5_000_000),
      },
      [MetricEnum.FLUID_FLOW_UPDATE, MetricEnum.WHOLE_UPDATE],
    );
    const data = buildSummaryChartData(
      result,
      {
        [MetricEnum.FLUID_FLOW_UPDATE.name]: MetricEnum.FLUID_FLOW_UPDATE,
        [MetricEnum.WHOLE_UPDATE.name]: MetricEnum.WHOLE_UPDATE,
      },
      AggregationStrategy.AVERAGE,
    );
    expect(data.metricValues.find(v => v.metricName === MetricEnum.OTHER.name)).toBeUndefined();
  });

  it("sorts part metrics by average descending (highest first)", () => {
    const result = makeResult(
      {
        [MetricEnum.ENTITY_UPDATE.name]: makeAggregate(2_000_000),
        [MetricEnum.TRAINS.name]: makeAggregate(5_000_000),
        [MetricEnum.WHOLE_UPDATE.name]: makeAggregate(10_000_000),
      },
      [MetricEnum.ENTITY_UPDATE, MetricEnum.TRAINS, MetricEnum.WHOLE_UPDATE],
    );
    const data = buildSummaryChartData(
      result,
      {
        [MetricEnum.ENTITY_UPDATE.name]: MetricEnum.ENTITY_UPDATE,
        [MetricEnum.TRAINS.name]: MetricEnum.TRAINS,
        [MetricEnum.WHOLE_UPDATE.name]: MetricEnum.WHOLE_UPDATE,
      },
      AggregationStrategy.AVERAGE,
    );
    const partMetrics = data.metricValues.filter(
      v => v.metricName !== MetricEnum.OTHER.name && v.metricName !== MetricEnum.WHOLE_UPDATE.name,
    );
    expect(partMetrics[0].metricName).toBe(MetricEnum.TRAINS.name);
    expect(partMetrics[1].metricName).toBe(MetricEnum.ENTITY_UPDATE.name);
  });

  it("populates the metrics array from the MetricRegistry", () => {
    const result = makeResult(
      {
        [MetricEnum.ENTITY_UPDATE.name]: makeAggregate(1_000_000),
        [MetricEnum.WHOLE_UPDATE.name]: makeAggregate(2_000_000),
      },
      [MetricEnum.ENTITY_UPDATE, MetricEnum.WHOLE_UPDATE],
    );
    const data = buildSummaryChartData(result, entityAndWhole, AggregationStrategy.AVERAGE);
    expect(data.metrics.map(m => m.name)).toContain(MetricEnum.ENTITY_UPDATE.name);
    expect(data.metrics.map(m => m.name)).toContain(MetricEnum.WHOLE_UPDATE.name);
  });
});
