import { describe, it, expect } from "vitest";
import {
  computeErrorBar,
  errorBarCells,
  errorBarColumns,
  errorBarsOverlap,
  overlapCell,
  sampleStandardDeviation,
  tCritical95,
} from "../data/errorBars";
import { createSummaryChartConfiguration } from "../charts/SummaryChart";
import { createEntityBreakdownChartConfiguration } from "../charts/EntityBreakdownChart";
import { AggregationStrategy } from "../data/AggregationStrategy";
import { MetricEnum } from "../data/MetricEnum";
import { makeResult } from "./fixtures";

describe("sampleStandardDeviation", () => {
  it("uses n - 1 in the denominator", () => {
    // mean 5, squared deviations sum 32 over 8 values: sample variance 32 / 7
    expect(sampleStandardDeviation([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(Math.sqrt(32 / 7), 10);
  });
});

describe("tCritical95", () => {
  it("returns the Student's t value for small samples and approaches 1.96", () => {
    expect(tCritical95(1)).toBe(12.706);
    expect(tCritical95(9)).toBe(2.262);
    expect(tCritical95(30)).toBe(2.042);
    expect(tCritical95(500)).toBe(1.96);
  });
});

describe("computeErrorBar", () => {
  const means = [100, 102, 98, 101, 99];

  it("draws +/- one sample standard deviation around the plotted value", () => {
    const sd = sampleStandardDeviation(means);
    const bar = computeErrorBar(means, "stddev", 100)!;
    expect(bar.lower).toBeCloseTo(100 - sd);
    expect(bar.upper).toBeCloseTo(100 + sd);
  });

  it("uses the t-based 95% confidence interval of the mean", () => {
    const sd = sampleStandardDeviation(means);
    const half = 2.776 * sd / Math.sqrt(5);
    const bar = computeErrorBar(means, "ci95", 100)!;
    expect(bar.upper - bar.lower).toBeCloseTo(2 * half);
  });

  it("spans the smallest to the largest run mean for minmax", () => {
    expect(computeErrorBar(means, "minmax", 100)).toEqual({ lower: 98, upper: 102 });
  });

  it("returns null when there are too few runs", () => {
    expect(computeErrorBar([], "minmax", 1)).toBeNull();
    expect(computeErrorBar([5], "stddev", 5)).toBeNull();
    expect(computeErrorBar([5], "ci95", 5)).toBeNull();
    expect(computeErrorBar([5], "minmax", 5)).toEqual({ lower: 5, upper: 5 });
  });
});

describe("overlap and table cells", () => {
  it("detects overlapping intervals, including touching ones", () => {
    expect(errorBarsOverlap({ lower: 1, upper: 3 }, { lower: 2, upper: 4 })).toBe(true);
    expect(errorBarsOverlap({ lower: 1, upper: 2 }, { lower: 2, upper: 4 })).toBe(true);
    expect(errorBarsOverlap({ lower: 1, upper: 2 }, { lower: 3, upper: 4 })).toBe(false);
  });

  it("leaves the overlap cell empty when a bar is missing", () => {
    expect(overlapCell(undefined, { lower: 1, upper: 2 })).toBe("");
    expect(overlapCell({ lower: 1, upper: 2 }, null)).toBe("");
    expect(overlapCell({ lower: 1, upper: 2 }, { lower: 5, upper: 6 })).toBe("no");
  });

  it("formats half-widths for stddev/ci95 and both ends for minmax", () => {
    expect(errorBarCells({ lower: 98, upper: 102 }, "stddev")).toEqual(["2.0"]);
    expect(errorBarCells({ lower: 98, upper: 102.25 }, "minmax")).toEqual(["98.0", "102.3"]);
    expect(errorBarCells(null, "minmax")).toEqual(["", ""]);
    expect(errorBarColumns("minmax", "UPS")).toEqual(["UPS Min Run", "UPS Max Run", "Overlaps Prev"]);
  });
});

describe("charts with error bars", () => {
  // Run means within each result differ by +/- 10 µs; the two results are 15 µs apart.
  const results = [
    makeResult("a", { wholeUpdate: 1000, entityUpdate: 700 }, { runMeans: { wholeUpdate: [990, 1010, 1000], entityUpdate: [690, 710, 700] } }),
    makeResult("b", { wholeUpdate: 1015, entityUpdate: 715 }, { runMeans: { wholeUpdate: [1005, 1025, 1015], entityUpdate: [705, 725, 715] } }),
  ];
  const summary = (extra: object = {}) =>
    createSummaryChartConfiguration(results, {
      aggregationStrategy: AggregationStrategy.AVERAGE,
      metrics: [MetricEnum.WHOLE_UPDATE, MetricEnum.ENTITY_UPDATE],
      errorBars: "minmax",
      ...extra,
    });

  it("adds the spread and an overlap flag to the summary table", () => {
    const { table } = summary();
    expect(table.header.slice(-3)).toEqual(["Whole Min Run", "Whole Max Run", "Overlaps Prev"]);
    expect(table.rows.map(row => row.slice(-3))).toEqual([["990.0", "1010.0", ""], ["1005.0", "1025.0", "yes"]]);
  });

  it("adds an error bars plugin only when requested", () => {
    expect(summary().config.plugins!.some((p: any) => p.id === "errorBars")).toBe(true);
    expect(summary({ errorBars: undefined }).config.plugins!.some((p: any) => p.id === "errorBars")).toBe(false);
  });

  it("converts per-run means to UPS before taking the spread on a UPS chart", () => {
    const { table } = createSummaryChartConfiguration(results, {
      aggregationStrategy: AggregationStrategy.AVERAGE,
      metrics: [MetricEnum.WHOLE_UPDATE],
      valueMode: "ups",
      errorBars: "minmax",
    });
    expect(table.header.slice(-3)).toEqual(["UPS Min Run", "UPS Max Run", "Overlaps Prev"]);
    expect(Number(table.rows[0][table.rows[0].length - 3])).toBeCloseTo(1_000_000 / 1010, 1);
    expect(Number(table.rows[0][table.rows[0].length - 2])).toBeCloseTo(1_000_000 / 990, 1);
  });

  it("uses the entity update's per-run means on the entity chart", () => {
    const { table } = createEntityBreakdownChartConfiguration(results, {
      aggregationStrategy: AggregationStrategy.AVERAGE,
      errorBars: "stddev",
    });
    expect(table.header.slice(-2)).toEqual(["Entity Update ± Std Dev", "Overlaps Prev"]);
    expect(table.rows[0].slice(-2)).toEqual(["10.0", ""]);
    expect(table.rows[1].slice(-1)).toEqual(["yes"]);
  });

  it("leaves rows without per-run data without a bar", () => {
    const perRunLike = [{ ...results[0], runs: new Map() }];
    const { table } = createSummaryChartConfiguration(perRunLike, {
      aggregationStrategy: AggregationStrategy.AVERAGE,
      metrics: [MetricEnum.WHOLE_UPDATE],
      errorBars: "stddev",
    });
    expect(table.rows[0].slice(-2)).toEqual(["", ""]);
  });
});
