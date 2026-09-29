import { describe, it, expect, vi } from "vitest";
import { createSummaryChartConfiguration } from "../charts/SummaryChart";
import { createEntityBreakdownChartConfiguration } from "../charts/EntityBreakdownChart";
import { BenchmarkAggregateRunResult, MetricAggregate } from "../data/BenchmarkAggregateResult";
import { AggregationStrategy } from "../data/AggregationStrategy";
import { MetricEnum } from "../data/MetricEnum";
import { MetricName } from "../data/Metric";
import { valueLabelsPlugin } from "../charts/plugins";

const makeAggregate = (nanos: number): MetricAggregate => ({
  average: nanos,
  standardDeviation: nanos * 0.05,
  minimum: nanos * 0.9,
  maximum: nanos * 1.1,
  median: nanos,
});

const makeResult = (
  all: Partial<Record<MetricName, MetricAggregate>>,
): BenchmarkAggregateRunResult => ({
  originalFileName: "test-map",
  displayName: "test-map",
  metrics: [MetricEnum.WHOLE_UPDATE, MetricEnum.ENTITY_UPDATE, MetricEnum.INSERTER],
  runs: new Map(),
  all: new Map(Object.entries(all) as [MetricName, MetricAggregate][]),
});

const results = [
  makeResult({
    [MetricEnum.WHOLE_UPDATE.name]: makeAggregate(8_000_000),
    [MetricEnum.ENTITY_UPDATE.name]: makeAggregate(5_000_000),
    [MetricEnum.INSERTER.name]: makeAggregate(2_000_000),
  }),
];

describe("--value-labels opt-in wiring", () => {
  it("SummaryChart omits the valueLabels plugin when valueLabels is unset", () => {
    const { config } = createSummaryChartConfiguration(results, {
      aggregationStrategy: AggregationStrategy.AVERAGE,
    });
    expect(config.plugins).not.toContain(valueLabelsPlugin);
  });

  it("SummaryChart includes the valueLabels plugin when valueLabels is true", () => {
    const { config } = createSummaryChartConfiguration(results, {
      aggregationStrategy: AggregationStrategy.AVERAGE,
      valueLabels: true,
    });
    expect(config.plugins).toContain(valueLabelsPlugin);
  });

  it("EntityBreakdownChart omits the valueLabels plugin when valueLabels is unset", () => {
    const { config } = createEntityBreakdownChartConfiguration(results, {
      aggregationStrategy: AggregationStrategy.AVERAGE,
    });
    expect(config.plugins).not.toContain(valueLabelsPlugin);
  });

  it("EntityBreakdownChart includes the valueLabels plugin when valueLabels is true", () => {
    const { config } = createEntityBreakdownChartConfiguration(results, {
      aggregationStrategy: AggregationStrategy.AVERAGE,
      valueLabels: true,
    });
    expect(config.plugins).toContain(valueLabelsPlugin);
  });
});

// Fakes chart.js's BarElement/DatasetMeta shape closely enough to exercise the plugin's
// own per-segment rectangle math
function makeFakeChart(datasets: { data: (number | null)[] }[], elementRects: { x: number; base: number; y: number }[][]) {
  const calls: string[] = [];
  const ctx = {
    save: vi.fn(),
    restore: vi.fn(),
    measureText: (text: string) => ({ width: text.length * 6 }),
    strokeText: (text: string) => calls.push(`stroke:${text}`),
    fillText: (text: string) => calls.push(`fill:${text}`),
    font: "",
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    textAlign: "",
    textBaseline: "",
  };
  const chart = {
    ctx,
    data: { datasets },
    getDatasetMeta: (datasetIndex: number) => ({
      hidden: false,
      data: elementRects[datasetIndex].map((rect) => ({
        getProps: () => rect,
      })),
    }),
  };
  return { chart, calls };
}

describe("valueLabelsPlugin drawing logic", () => {
  it("draws a label centered in a segment wide enough to fit it", () => {
    const { chart, calls } = makeFakeChart(
      [{ data: [9169] }],
      [[{ x: 800, base: 100, y: 50 }]], // 700px wide segment
    );
    valueLabelsPlugin.afterDatasetsDraw(chart as any);
    expect(calls).toEqual(["stroke:9169", "fill:9169"]);
  });

  it("skips segments too thin to legibly fit the formatted value", () => {
    const { chart, calls } = makeFakeChart(
      [{ data: [9169] }],
      [[{ x: 105, base: 100, y: 50 }]], // 5px wide segment
    );
    valueLabelsPlugin.afterDatasetsDraw(chart as any);
    expect(calls).toEqual([]);
  });

  it("skips null (spacer row) and near-zero values", () => {
    const { chart, calls } = makeFakeChart(
      [{ data: [null, 0.4] }],
      [[
        { x: 800, base: 100, y: 50 },
        { x: 800, base: 100, y: 90 },
      ]],
    );
    valueLabelsPlugin.afterDatasetsDraw(chart as any);
    expect(calls).toEqual([]);
  });
});

