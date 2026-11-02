import { describe, it, expect } from "vitest";
import { createSummaryChartConfiguration } from "../charts/SummaryChart";
import { createEntityBreakdownChartConfiguration } from "../charts/EntityBreakdownChart";
import { AggregationStrategy } from "../data/AggregationStrategy";
import { MetricEnum } from "../data/MetricEnum";
import { makeResult } from "./fixtures";

const results = [
  makeResult("c", { wholeUpdate: 3000, entityUpdate: 2000, Inserter: 1000 }),
  makeResult("a", { wholeUpdate: 1000, entityUpdate: 600, Inserter: 300 }),
  makeResult("b", { wholeUpdate: 2000, entityUpdate: 1500, Inserter: 700 }),
];

const summaryLabels = (sort?: "total" | "input" | "name", extra: object = {}) =>
  createSummaryChartConfiguration(results, {
    aggregationStrategy: AggregationStrategy.AVERAGE,
    metrics: [MetricEnum.WHOLE_UPDATE, MetricEnum.ENTITY_UPDATE],
    sort,
    ...extra,
  }).config.data.labels;

describe("summary chart row order", () => {
  it("sorts by total by default", () => {
    expect(summaryLabels()).toEqual(["a", "b", "c"]);
    expect(summaryLabels("total")).toEqual(["a", "b", "c"]);
  });

  it("keeps the input order with sort=input", () => {
    expect(summaryLabels("input")).toEqual(["c", "a", "b"]);
  });

  it("sorts by label with sort=name", () => {
    expect(summaryLabels("name")).toEqual(["a", "b", "c"]);
  });

  it("applies the same sort inside each group", () => {
    const grouped = [
      makeResult("x2", { wholeUpdate: 2000, entityUpdate: 1000 }, { group: "g1" }),
      makeResult("x1", { wholeUpdate: 3000, entityUpdate: 1000 }, { group: "g1" }),
      makeResult("y1", { wholeUpdate: 1000, entityUpdate: 1000 }, { group: "g2" }),
    ];
    const labels = (sort: "total" | "input") =>
      createSummaryChartConfiguration(grouped, {
        aggregationStrategy: AggregationStrategy.AVERAGE,
        metrics: [MetricEnum.WHOLE_UPDATE, MetricEnum.ENTITY_UPDATE],
        groupBy: ["g1", "g2"],
        sort,
      }).config.data.labels;
    expect(labels("total")).toEqual(["​g1", "x2", "x1", "​g2", "y1"]);
    // Same two g1 rows, now in input order rather than by total.
    expect(labels("input")).toEqual(["​g1", "x2", "x1", "​g2", "y1"]);
    const reversed = [grouped[1], grouped[0], grouped[2]];
    expect(
      createSummaryChartConfiguration(reversed, {
        aggregationStrategy: AggregationStrategy.AVERAGE,
        metrics: [MetricEnum.WHOLE_UPDATE, MetricEnum.ENTITY_UPDATE],
        groupBy: ["g1", "g2"],
        sort: "input",
      }).config.data.labels,
    ).toEqual(["​g1", "x1", "x2", "​g2", "y1"]);
  });

  it("measures 'vs Best' against the fastest row even when the order is not by total", () => {
    const { table } = createSummaryChartConfiguration(results, {
      aggregationStrategy: AggregationStrategy.AVERAGE,
      metrics: [MetricEnum.WHOLE_UPDATE, MetricEnum.ENTITY_UPDATE],
      sort: "input",
    });
    // Rows are c (3000), a (1000), b (2000): "a" is the best, so its vs Best cell is empty.
    const vsBest = table.rows.map(row => row[row.length - 1]);
    expect(vsBest).toEqual(["3.00x", "", "2.00x"]);
  });
});

describe("entity chart row order", () => {
  const labels = (sort?: "total" | "input" | "name") =>
    createEntityBreakdownChartConfiguration(results, {
      aggregationStrategy: AggregationStrategy.AVERAGE,
      sort,
    }).config.data.labels;

  it("sorts by entityUpdate by default and honours sort", () => {
    expect(labels()).toEqual(["a", "b", "c"]);
    expect(labels("input")).toEqual(["c", "a", "b"]);
    expect(labels("name")).toEqual(["a", "b", "c"]);
  });
});

describe("entity chart rest of tick", () => {
  const withWhole = [
    makeResult("a", { wholeUpdate: 3000, entityUpdate: 1000, Inserter: 800 }),
    makeResult("b", { wholeUpdate: 2000, entityUpdate: 1500, Inserter: 1200 }),
  ];
  const build = (restOfTick: boolean) =>
    createEntityBreakdownChartConfiguration(withWhole, { aggregationStrategy: AggregationStrategy.AVERAGE, restOfTick });

  it("ranks by entityUpdate without it, so the longer whole update ranks first", () => {
    expect(build(false).config.data.labels).toEqual(["a", "b"]);
  });

  it("adds a Rest of Tick segment of wholeUpdate - entityUpdate and ranks by the whole update", () => {
    const { config, table } = build(true);
    expect(config.data.labels).toEqual(["b", "a"]);
    const rest = config.data.datasets.find(d => d.label === "Rest of Tick")!;
    expect(rest.data).toEqual([500, 2000]);
    expect(table.header.slice(-4)).toEqual(["Entity Update Total", "Whole Update Total", "vs Prev", "vs Best"]);
    expect(table.rows[0].slice(-4)).toEqual([1500, 2000, "", ""]);
  });

  it("keeps each bar's segments summing to the whole update", () => {
    const { config } = build(true);
    config.data.labels!.forEach((_, row) => {
      const sum = config.data.datasets.reduce((total, d) => total + (d.data[row] as number), 0);
      expect(sum).toBeCloseTo(row === 0 ? 2000 : 3000);
    });
  });
});
