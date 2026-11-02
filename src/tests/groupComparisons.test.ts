import { describe, it, expect } from "vitest";
import { comparisonRows } from "../data/comparison";
import { createSummaryChartConfiguration } from "../charts/SummaryChart";
import { createEntityBreakdownChartConfiguration } from "../charts/EntityBreakdownChart";
import { AggregationStrategy } from "../data/AggregationStrategy";
import { MetricEnum } from "../data/MetricEnum";
import { makeResult } from "./fixtures";

describe("comparisonRows", () => {
  it("without groups compares with the row above and the lowest total", () => {
    expect(comparisonRows([5, 3, 4])).toEqual({ previous: [null, 0, 1], best: [1, 1, 1] });
  });

  it("restarts at each group", () => {
    const rows = comparisonRows([5, 7, 3, 4], ["a", "a", "b", "b"]);
    expect(rows.previous).toEqual([null, 0, null, 2]);
    expect(rows.best).toEqual([0, 0, 2, 2]);
  });

  it("takes the first of tied rows as best", () => {
    expect(comparisonRows([2, 2, 3]).best).toEqual([0, 0, 0]);
  });

  it("handles no rows", () => {
    expect(comparisonRows([])).toEqual({ previous: [], best: [] });
  });
});

// Whole update in microseconds. UPS is 1e6 / time, so 1000 us = 1000 UPS and 2000 us = 500 UPS.
const grouped = [
  makeResult("a-fast", { wholeUpdate: 1000, entityUpdate: 400 }, { group: "g1", runMeans: { wholeUpdate: [1000, 1010] } }),
  makeResult("a-mid", { wholeUpdate: 2000, entityUpdate: 800 }, { group: "g1", runMeans: { wholeUpdate: [2000, 2010] } }),
  makeResult("a-slow", { wholeUpdate: 4000, entityUpdate: 1000 }, { group: "g1", runMeans: { wholeUpdate: [4000, 4010] } }),
  makeResult("b-fast", { wholeUpdate: 3000, entityUpdate: 1200 }, { group: "g2", runMeans: { wholeUpdate: [3000, 3010] } }),
  makeResult("b-slow", { wholeUpdate: 6000, entityUpdate: 3000 }, { group: "g2", runMeans: { wholeUpdate: [6000, 6010] } }),
];
const base = { aggregationStrategy: AggregationStrategy.AVERAGE, metrics: [MetricEnum.WHOLE_UPDATE, MetricEnum.ENTITY_UPDATE] };
const lastCells = (rows: (string | number)[][], count: number) => rows.map(row => row.slice(row.length - count));

describe("summary table comparisons with --group-by", () => {
  const { table } = createSummaryChartConfiguration(grouped, { ...base, groupBy: ["g1", "g2"] });

  it("leaves vs Prev empty on the first row of each group and compares with the row above otherwise", () => {
    expect(table.header.slice(-2)).toEqual(["vs Prev", "vs Best"]);
    expect(lastCells(table.rows, 2)).toEqual([
      ["", ""],
      ["2.00x", "2.00x"],
      ["2.00x", "4.00x"],
      ["", ""],
      ["2.00x", "2.00x"],
    ]);
  });

  it("compares vs Best with the best row of the group, not the first row of the table", () => {
    // b-slow is 6000 us: 2x its group's best (3000), not 6x the first row of the table (1000).
    expect(table.rows[4].slice(-1)).toEqual(["2.00x"]);
  });

  it("uses the best row of the group even when --sort input puts it later", () => {
    const reversed = [grouped[2], grouped[1], grouped[0], grouped[4], grouped[3]];
    const { table: inputOrder } = createSummaryChartConfiguration(reversed, { ...base, groupBy: ["g1", "g2"], sort: "input" });
    expect(lastCells(inputOrder.rows, 2)).toEqual([
      ["", "4.00x"],
      ["-50.0%", "2.00x"],
      ["-50.0%", ""],
      ["", "2.00x"],
      ["-50.0%", ""],
    ]);
  });

  it("shows ups as +/- changes inside each group, positive meaning more UPS than the best", () => {
    const { table: ups } = createSummaryChartConfiguration(grouped, { ...base, metrics: [MetricEnum.WHOLE_UPDATE], valueMode: "ups", groupBy: ["g1", "g2"] });
    expect(ups.header.slice(-2)).toEqual(["+/- vs Previous", "+/- vs Best"]);
    // UPS: g1 = 1000, 500, 250; g2 = 333, 167.
    expect(lastCells(ups.rows, 3)).toEqual([
      [1000, "", "0"],
      [500, "-500", "-500"],
      [250, "-250", "-750"],
      [333, "", "0"],
      [167, "-167", "-167"],
    ]);
  });

  it("follows the same group rule for Overlaps Prev", () => {
    const { table: bars } = createSummaryChartConfiguration(grouped, { ...base, groupBy: ["g1", "g2"], errorBars: "minmax" });
    const overlaps = bars.rows.map(row => row[row.length - 1]);
    // Every row's bar is a narrow min-max range apart from its neighbours: "no" inside a group, empty at its start.
    expect(overlaps).toEqual(["", "no", "no", "", "no"]);
  });
});

describe("summary table comparisons without groups", () => {
  it("measures vs Best against the actual best row", () => {
    const rows = [grouped[3], grouped[1], grouped[0]];
    const { table } = createSummaryChartConfiguration(rows, { ...base, sort: "input" });
    // 3000, 2000, 1000: the best is the last row.
    expect(lastCells(table.rows, 2)).toEqual([["", "3.00x"], ["-33.3%", "2.00x"], ["-50.0%", ""]]);
  });

  it("measures the ups +/- vs Best against the best UPS", () => {
    const rows = [grouped[3], grouped[0]];
    const { table } = createSummaryChartConfiguration(rows, { ...base, metrics: [MetricEnum.WHOLE_UPDATE], valueMode: "ups", sort: "input" });
    expect(lastCells(table.rows, 3)).toEqual([[333, "", "-667"], [1000, "+667", "0"]]);
  });
});

describe("entity-summary table comparisons", () => {
  const comparisons = (groupBy?: string[], sort?: "total" | "input") =>
    lastCells(createEntityBreakdownChartConfiguration(grouped, { aggregationStrategy: AggregationStrategy.AVERAGE, groupBy, sort }).table.rows, 2);

  it("restarts vs Prev and vs Best at each group", () => {
    // Entity updates: g1 = 400, 800, 1000; g2 = 1200, 3000.
    expect(comparisons(["g1", "g2"])).toEqual([
      ["", ""],
      ["2.00x", "2.00x"],
      ["+25.0%", "2.50x"],
      ["", ""],
      ["2.50x", "2.50x"],
    ]);
  });

  it("measures vs Best against the actual best row without groups", () => {
    // Input order is a-fast, a-mid, a-slow, b-fast, b-slow; the best, a-fast, is first. Reverse to move it.
    const reversed = [...grouped].reverse();
    const rows = createEntityBreakdownChartConfiguration(reversed, { aggregationStrategy: AggregationStrategy.AVERAGE, sort: "input" }).table.rows;
    expect(lastCells(rows, 2)).toEqual([["", "7.50x"], ["-60.0%", "3.00x"], ["-16.7%", "2.50x"], ["-20.0%", "2.00x"], ["-50.0%", ""]]);
  });

  it("follows the group rule for Overlaps Prev", () => {
    const withBars = [
      makeResult("p", { wholeUpdate: 1000, entityUpdate: 100 }, { group: "g1", runMeans: { entityUpdate: [100, 100] } }),
      makeResult("q", { wholeUpdate: 1000, entityUpdate: 100 }, { group: "g1", runMeans: { entityUpdate: [100, 100] } }),
      makeResult("r", { wholeUpdate: 1000, entityUpdate: 100 }, { group: "g2", runMeans: { entityUpdate: [100, 100] } }),
    ];
    const { table } = createEntityBreakdownChartConfiguration(withBars, { aggregationStrategy: AggregationStrategy.AVERAGE, groupBy: ["g1", "g2"], errorBars: "stddev" });
    expect(table.rows.map(row => row[row.length - 1])).toEqual(["", "yes", ""]);
  });
});
