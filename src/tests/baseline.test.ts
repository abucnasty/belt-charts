import { describe, it, expect } from "vitest";
import { formatPercentChange, formatSigned, parseBaselinePerGroup, resolveBaselines } from "../data/baseline";
import { createSummaryChartConfiguration } from "../charts/SummaryChart";
import { createEntityBreakdownChartConfiguration } from "../charts/EntityBreakdownChart";
import { AggregationStrategy } from "../data/AggregationStrategy";
import { MetricEnum } from "../data/MetricEnum";
import { UserError } from "../utils";
import { makeResult } from "./fixtures";

const row = (displayName: string, group?: string, originalFileName = displayName) => ({ displayName, originalFileName, group });

describe("parseBaselinePerGroup", () => {
  it("splits key=label pairs on commas", () => {
    expect([...parseBaselinePerGroup("q1=Q1 As Saved, q2=Q2 As Saved")]).toEqual([["q1", "Q1 As Saved"], ["q2", "Q2 As Saved"]]);
  });

  it("keeps = inside a label", () => {
    expect(parseBaselinePerGroup("g=a=b").get("g")).toBe("a=b");
  });

  it("rejects an entry without a label", () => {
    expect(() => parseBaselinePerGroup("q1")).toThrow(UserError);
    expect(() => parseBaselinePerGroup("q1=")).toThrow(UserError);
  });
});

describe("resolveBaselines", () => {
  it("points every row at the row matching --baseline by label or base name", () => {
    const rows = [row("As Saved", undefined, "4i-as-saved"), row("Shuffled", undefined, "4i-shuffled")];
    expect(resolveBaselines(rows, { baseline: "As Saved" })).toEqual([0, 0]);
    expect(resolveBaselines(rows, { baseline: "4i-as-saved" })).toEqual([0, 0]);
  });

  it("looks --baseline up inside each group when results are grouped", () => {
    const rows = [row("A", "g1", "a1"), row("B", "g1", "b1"), row("A", "g2", "a2"), row("B", "g2", "b2")];
    expect(resolveBaselines(rows, { baseline: "A" })).toEqual([0, 0, 2, 2]);
  });

  it("uses the per-group baseline of each group", () => {
    const rows = [row("A", "g1"), row("B", "g1"), row("C", "g2"), row("D", "g2")];
    expect(resolveBaselines(rows, { baselinePerGroup: new Map([["g1", "B"], ["g2", "C"]]) })).toEqual([1, 1, 2, 2]);
  });

  it("lets a per-group entry override --baseline for its group only", () => {
    const rows = [row("A", "g1"), row("B", "g1"), row("A", "g2"), row("B", "g2")];
    expect(resolveBaselines(rows, { baseline: "A", baselinePerGroup: new Map([["g2", "B"]]) })).toEqual([0, 0, 3, 3]);
  });

  it("explains a baseline that matches nothing", () => {
    expect(() => resolveBaselines([row("A")], { baseline: "Z" })).toThrow(/did not match any row \(rows: A\)/);
  });

  it("explains an ambiguous baseline", () => {
    const rows = [row("A (x)", undefined, "a"), row("A (y)", undefined, "a")];
    expect(() => resolveBaselines(rows, { baseline: "a" })).toThrow(/matches 2 rows/);
    expect(resolveBaselines(rows, { baseline: "A (y)" })).toEqual([1, 1]);
  });

  it("requires a baseline for every group", () => {
    const rows = [row("A", "g1"), row("B", "g2")];
    expect(() => resolveBaselines(rows, { baselinePerGroup: new Map([["g1", "A"]]) })).toThrow(/no entry for group "g2"/);
  });
});

describe("formatting", () => {
  it("signs changes and avoids negative zero", () => {
    expect(formatSigned(86.34)).toBe("+86.3");
    expect(formatSigned(-4)).toBe("-4.0");
    expect(formatSigned(-0.01)).toBe("0.0");
    expect(formatSigned(2.6, 0)).toBe("+3");
  });

  it("formats percent change against the baseline", () => {
    expect(formatPercentChange(1000, 1049)).toBe("+4.9%");
    expect(formatPercentChange(1000, 900)).toBe("-10.0%");
    expect(formatPercentChange(0, 5)).toBe("");
  });
});

// Four builds that only differ in Inserter time, against "As Saved".
const builds = [
  makeResult("as-saved", { wholeUpdate: 2000, entityUpdate: 1500, Inserter: 900, AssemblingMachine: 600, controlBehaviorUpdate: 100 }),
  makeResult("forward", { wholeUpdate: 1914, entityUpdate: 1414, Inserter: 814, AssemblingMachine: 600, controlBehaviorUpdate: 100 }),
  makeResult("backward", { wholeUpdate: 1903, entityUpdate: 1403, Inserter: 803, AssemblingMachine: 600, controlBehaviorUpdate: 100 }),
  makeResult("shuffled", { wholeUpdate: 2090, entityUpdate: 1590, Inserter: 990, AssemblingMachine: 600, controlBehaviorUpdate: 100 }),
];

describe("summary chart against a baseline", () => {
  const build = (extra: object = {}) =>
    createSummaryChartConfiguration(builds, {
      aggregationStrategy: AggregationStrategy.AVERAGE,
      metrics: [MetricEnum.WHOLE_UPDATE, MetricEnum.ENTITY_UPDATE, MetricEnum.CONTROL_BEHAVIOR_UPDATE],
      baseline: "as-saved",
      sort: "input" as const,
      ...extra,
    });

  it("draws each segment as its change against the baseline row", () => {
    const { config } = build();
    const labels = config.data.labels as string[];
    expect(labels).toEqual(["as-saved (baseline)", "forward", "backward", "shuffled"]);
    const entity = config.data.datasets.find(d => d.label === "Entity")!;
    expect(entity.data).toEqual([0, -86, -97, 90]);
    // Segments that did not move stay at zero.
    const control = config.data.datasets.find(d => d.label === "Control Behaviors")!;
    expect(control.data).toEqual([0, 0, 0, 0]);
  });

  it("exports deltas with the whole update's percent change and absolute value", () => {
    const { table } = build();
    expect(table.header).toEqual(["Save File", "Δ Entity", "Δ Control Behaviors", "Δ Other", "Δ Whole", "Δ Whole %", "Whole"]);
    expect(table.rows[1]).toEqual(["forward", "-86.0", "0.0", "0.0", "-86.0", "-4.3%", 1914]);
    expect(table.rows[0].slice(1, 6)).toEqual(["0.0", "0.0", "0.0", "0.0", "0.0%"]);
  });

  it("draws the change in updates per second for a UPS chart", () => {
    const { config, table } = createSummaryChartConfiguration(builds, {
      aggregationStrategy: AggregationStrategy.AVERAGE,
      metrics: [MetricEnum.WHOLE_UPDATE],
      valueMode: "ups",
      baseline: "as-saved",
      sort: "input",
    });
    const data = config.data.datasets[0].data as number[];
    expect(data[0]).toBe(0);
    expect(data[1]).toBeCloseTo(1_000_000 / 1914 - 500, 5);
    expect(table.header).toEqual(["Save File", "UPS", "+/- vs Baseline", "% vs Baseline"]);
    expect(table.rows[1][0]).toBe("forward");
    expect(table.rows[1][2]).toBe("+22");
  });

  it("throws a UserError for an unknown baseline", () => {
    expect(() => build({ baseline: "nope" })).toThrow(UserError);
  });

  it("leaves the chart unchanged without a baseline", () => {
    const { config } = build({ baseline: undefined });
    const entity = config.data.datasets.find(d => d.label === "Entity")!;
    expect(entity.data).toEqual([1500, 1414, 1403, 1590]);
  });
});

describe("entity chart against a baseline", () => {
  const { config, table } = createEntityBreakdownChartConfiguration(builds, {
    aggregationStrategy: AggregationStrategy.AVERAGE,
    baseline: "as-saved",
    sort: "input",
  });

  it("shows only the Inserter segment moving, and by how much", () => {
    const inserter = config.data.datasets.find(d => d.label === "Inserter")!;
    expect(inserter.data).toEqual([0, -86, -97, 90]);
    const assembly = config.data.datasets.find(d => d.label === "Assembly Machine")!;
    expect(assembly.data).toEqual([0, 0, 0, 0]);
  });

  it("exports the segment deltas and the total change", () => {
    expect(table.header.slice(-3)).toEqual(["Δ Entity Update", "Δ Entity Update %", "Entity Update Total"]);
    expect(table.rows[1].slice(-3)).toEqual(["-86.0", "-5.7%", 1414]);
  });
});
