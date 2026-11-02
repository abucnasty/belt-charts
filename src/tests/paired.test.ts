import { describe, it, expect } from "vitest";
import { buildPaired, pairLabelOf, sessionsOf, type PairedItem } from "../charts/paired";
import { createSummaryChartConfiguration } from "../charts/SummaryChart";
import { createEntityBreakdownChartConfiguration } from "../charts/EntityBreakdownChart";
import { AggregationStrategy } from "../data/AggregationStrategy";
import { MetricEnum } from "../data/MetricEnum";
import { UserError } from "../utils";
import { makeResult } from "./fixtures";

describe("pairLabelOf and sessionsOf", () => {
  it("strips the input suffix from a displayed label", () => {
    expect(pairLabelOf({ displayName: "4 Inserters (mimalloc)", inputSuffix: "mimalloc" })).toBe("4 Inserters");
    expect(pairLabelOf({ displayName: "4 Inserters" })).toBe("4 Inserters");
  });

  it("lists sessions in input order", () => {
    expect(sessionsOf([{ inputSuffix: "b" }, { inputSuffix: "a" }, { inputSuffix: "b" }])).toEqual(["b", "a"]);
  });

  it("requires a suffix on every input and at least two sessions", () => {
    expect(() => sessionsOf([{ inputSuffix: "a" }, {}])).toThrow(UserError);
    expect(() => sessionsOf([{ inputSuffix: "a" }, { inputSuffix: "a" }])).toThrow(/at least two/);
  });
});

const item = (label: string, session: string, total: number, group?: string): PairedItem =>
  ({ label, session, group, total, segments: new Map([["x", total / 2]]) });
const options = { sessions: ["a", "b"], groupBy: [], sort: "total" as const, singleBar: false, digits: 0, totalLabel: "Whole", spacerPrefix: "​" };

describe("buildPaired", () => {
  const items = [item("p", "a", 300), item("q", "a", 100), item("p", "b", 280), item("q", "b", 130)];

  it("makes one row per save and one dataset per session and segment", () => {
    const layout = buildPaired(items, [{ name: "x", description: "X" }], options);
    expect(layout.labels).toEqual(["q", "p"]);
    expect(layout.datasets.map(d => [d.label, d.stack, d.data])).toEqual([
      ["X", "a", [50, 150]],
      ["X", "b", [65, 140]],
    ]);
  });

  it("ranks by the first session's total, or by name, or keeps input order", () => {
    const labels = (sort: "total" | "name" | "input") => buildPaired(items, [], { ...options, sort }).labels;
    expect(labels("total")).toEqual(["q", "p"]);
    expect(labels("name")).toEqual(["p", "q"]);
    expect(labels("input")).toEqual(["p", "q"]);
    expect(buildPaired(items, [], { ...options, higherIsBetter: true }).labels).toEqual(["p", "q"]);
  });

  it("uses one bar per session with the session as the legend label when single-bar", () => {
    const layout = buildPaired(items, [], { ...options, singleBar: true });
    expect(layout.datasets.map(d => [d.label, d.segmentName, d.data])).toEqual([
      ["a", null, [100, 300]],
      ["b", null, [130, 280]],
    ]);
  });

  it("builds a table with each session's total and the change against the first", () => {
    const { table } = buildPaired(items, [], options);
    expect(table.header).toEqual(["Save File", "Whole (a)", "Whole (b)", "+/- b vs a", "% b vs a"]);
    expect(table.rows).toEqual([["q", 100, 130, "+30", "+30.0%"], ["p", 300, 280, "-20", "-6.7%"]]);
  });

  it("leaves cells blank for a save missing from a session", () => {
    const { table, datasets } = buildPaired([item("p", "a", 100), item("p", "b", 90), item("only-a", "a", 50)], [], { ...options, singleBar: true });
    const onlyA = table.rows.find(row => row[0] === "only-a")!;
    expect(onlyA).toEqual(["only-a", 50, "", "", ""]);
    expect(datasets[1].data).toContain(null);
  });

  it("clusters rows under group headers", () => {
    const grouped = [item("p", "a", 1, "g2"), item("p", "b", 2, "g2"), item("q", "a", 3, "g1"), item("q", "b", 4, "g1")];
    const layout = buildPaired(grouped, [], { ...options, groupBy: ["g1", "g2"], singleBar: true });
    expect(layout.labels).toEqual(["​g1", "q", "​g2", "p"]);
    expect(layout.table.header.slice(0, 2)).toEqual(["Group", "Save File"]);
    expect(layout.datasets[0].data).toEqual([null, 3, null, 1]);
  });

  it("rejects two rows with the same label in one session", () => {
    expect(() => buildPaired([item("p", "a", 1), item("p", "a", 2)], [], options)).toThrow(UserError);
  });
});

describe("paired charts", () => {
  const malloc = { inputSuffix: "malloc" };
  const mimalloc = { inputSuffix: "mimalloc" };
  const results = [
    makeResult("as-saved", { wholeUpdate: 2000, entityUpdate: 1500, Inserter: 900 }, malloc),
    makeResult("shuffled", { wholeUpdate: 2200, entityUpdate: 1700, Inserter: 1100 }, malloc),
    makeResult("as-saved", { wholeUpdate: 1900, entityUpdate: 1400, Inserter: 800 }, mimalloc),
    makeResult("shuffled", { wholeUpdate: 2100, entityUpdate: 1600, Inserter: 1000 }, mimalloc),
  ];

  it("summary: stacks each session's segments side by side in one row per save", () => {
    const { config, table } = createSummaryChartConfiguration(results, {
      aggregationStrategy: AggregationStrategy.AVERAGE,
      metrics: [MetricEnum.WHOLE_UPDATE, MetricEnum.ENTITY_UPDATE],
      paired: true,
    });
    expect(config.data.labels).toEqual(["as-saved", "shuffled"]);
    const entity = config.data.datasets.filter(d => d.label === "Entity");
    expect(entity.map(d => [(d as any).stack, d.data])).toEqual([["malloc", [1500, 1700]], ["mimalloc", [1400, 1600]]]);
    expect(table.rows[0]).toEqual(["as-saved", 2000, 1900, "-100", "-5.0%"]);
  });

  it("ups: one colored bar per session", () => {
    const { config } = createSummaryChartConfiguration(results, {
      aggregationStrategy: AggregationStrategy.AVERAGE,
      metrics: [MetricEnum.WHOLE_UPDATE],
      valueMode: "ups",
      paired: true,
    });
    expect(config.data.datasets.map(d => d.label)).toEqual(["malloc", "mimalloc"]);
    expect(config.data.datasets[0].backgroundColor).not.toEqual(config.data.datasets[1].backgroundColor);
    // Fastest (highest UPS) first, like the unpaired chart.
    expect(config.data.labels).toEqual(["as-saved", "shuffled"]);
    expect(config.data.datasets[0].data[0]).toBeCloseTo(500);
  });

  it("entity: pairs the entity segments of each save", () => {
    const { config, table } = createEntityBreakdownChartConfiguration(results, {
      aggregationStrategy: AggregationStrategy.AVERAGE,
      paired: true,
    });
    expect(config.data.labels).toEqual(["as-saved", "shuffled"]);
    const inserter = config.data.datasets.filter(d => d.label === "Inserter");
    expect(inserter.map(d => d.data)).toEqual([[900, 1100], [800, 1000]]);
    expect(table.header.slice(0, 3)).toEqual(["Save File", "Entity Update (malloc)", "Entity Update (mimalloc)"]);
  });

  it("is an error without suffixes", () => {
    const plain = [makeResult("a", { wholeUpdate: 1, entityUpdate: 1 }), makeResult("b", { wholeUpdate: 1, entityUpdate: 1 })];
    expect(() => createSummaryChartConfiguration(plain, { aggregationStrategy: AggregationStrategy.AVERAGE, paired: true })).toThrow(UserError);
  });
});
