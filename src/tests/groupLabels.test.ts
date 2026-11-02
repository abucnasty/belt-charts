import { describe, it, expect } from "vitest";
import { parseGroupBy, groupLabel } from "../data/groupBy";
import { groupByOptionsFrom, assignToGroup } from "../commands/utils";
import { createSummaryCommand } from "../commands/summary";
import { buildChartInvocations } from "../commands/render";
import { createSummaryChartConfiguration } from "../charts/SummaryChart";
import { createEntityBreakdownChartConfiguration } from "../charts/EntityBreakdownChart";
import { buildPaired, type PairedItem } from "../charts/paired";
import { AggregationStrategy } from "../data/AggregationStrategy";
import { MetricEnum } from "../data/MetricEnum";
import { UserError } from "../utils";
import { makeResult } from "./fixtures";

describe("parseGroupBy", () => {
  it("takes plain keys as before, with no labels", () => {
    const { keys, labels } = parseGroupBy(["as-saved", "memory-forward"]);
    expect(keys).toEqual(["as-saved", "memory-forward"]);
    expect(labels.size).toBe(0);
  });

  it("splits key=Label entries and keeps the key order", () => {
    const { keys, labels } = parseGroupBy(["3i-2to1=3 Inserters 2:1", "3i-3to1=3 Inserters 3:1", "4i=4 Inserters"]);
    expect(keys).toEqual(["3i-2to1", "3i-3to1", "4i"]);
    expect(labels.get("3i-2to1")).toBe("3 Inserters 2:1");
    expect(labels.get("4i")).toBe("4 Inserters");
  });

  it("mixes entries with and without a label", () => {
    const { keys, labels } = parseGroupBy(["q1=Quality 1", "q2"]);
    expect(keys).toEqual(["q1", "q2"]);
    expect([...labels.entries()]).toEqual([["q1", "Quality 1"]]);
    expect(groupLabel(labels, "q1")).toBe("Quality 1");
    expect(groupLabel(labels, "q2")).toBe("q2");
    expect(groupLabel(undefined, "q2")).toBe("q2");
  });

  it("splits on the first = only and trims spaces", () => {
    const { keys, labels } = parseGroupBy([" a = x=y ", ""]);
    expect(keys).toEqual(["a"]);
    expect(labels.get("a")).toBe("x=y");
  });

  it("rejects an empty key or an empty label", () => {
    expect(() => parseGroupBy(["=Label"])).toThrow(UserError);
    expect(() => parseGroupBy(["key="])).toThrow(/invalid entry "key="/);
  });

  it("matches files by the key, longest key first, never by the label", () => {
    const { keys } = parseGroupBy(["q2=Quality 2", "q2_lds=Quality 2 LDS"]);
    expect(assignToGroup("run_q2_lds_a", keys)).toBe("q2_lds");
    expect(assignToGroup("run_q2_a", keys)).toBe("q2");
    expect(assignToGroup("Quality 2", keys)).toBeNull();
  });
});

describe("--group-by through the commands", () => {
  it("is parsed into keys and labels from the command line", () => {
    const command = createSummaryCommand();
    command.parseOptions(["--group-by", "3i-2to1=3 Inserters 2:1,4i"]);
    const { groupBy, groupLabels } = groupByOptionsFrom(command.opts());
    expect(groupBy).toEqual(["3i-2to1", "4i"]);
    expect(groupLabels.get("3i-2to1")).toBe("3 Inserters 2:1");
    expect(groupLabels.has("4i")).toBe(false);
  });

  it("gives no groups when the option is absent", () => {
    expect(groupByOptionsFrom({})).toEqual({ groupBy: [], groupLabels: new Map() });
  });

  it("passes a groupBy string with labels from a render config unchanged", () => {
    const [chart] = buildChartInvocations(
      { charts: [{ command: "summary", input: "a/*.csv", output: "o.png", groupBy: "a=Design A,b=Design B" }] },
      "/cfg",
    );
    expect(chart.argv).toEqual(expect.arrayContaining(["--group-by", "a=Design A,b=Design B"]));
  });
});

const grouped = [
  makeResult("x1", { wholeUpdate: 1000, entityUpdate: 600, Inserter: 300 }, { group: "g1" }),
  makeResult("y1", { wholeUpdate: 2000, entityUpdate: 900, Inserter: 400 }, { group: "g2" }),
];
const labels = new Map([["g1", "Group One"]]);

describe("group labels in charts and tables", () => {
  it("shows the label in the summary heading and the Group column, and a key without a label as itself", () => {
    const { config, table } = createSummaryChartConfiguration(grouped, {
      aggregationStrategy: AggregationStrategy.AVERAGE,
      metrics: [MetricEnum.WHOLE_UPDATE, MetricEnum.ENTITY_UPDATE],
      groupBy: ["g1", "g2"],
      groupLabels: labels,
    });
    expect(config.data.labels).toEqual(["​Group One", "x1", "​g2", "y1"]);
    expect(table.header[0]).toBe("Group");
    expect(table.rows.map(row => row[0])).toEqual(["Group One", "g2"]);
  });

  it("labels the ups table and the baseline table too", () => {
    const base = { aggregationStrategy: AggregationStrategy.AVERAGE, metrics: [MetricEnum.WHOLE_UPDATE], groupBy: ["g1", "g2"], groupLabels: labels };
    const ups = createSummaryChartConfiguration(grouped, { ...base, valueMode: "ups" });
    expect(ups.table.rows.map(row => row[0])).toEqual(["Group One", "g2"]);
    // --baseline-per-group is still given in group keys.
    const delta = createSummaryChartConfiguration(grouped, { ...base, baselinePerGroup: new Map([["g1", "x1"], ["g2", "y1"]]) });
    expect(delta.table.rows.map(row => row[0])).toEqual(["Group One", "g2"]);
    expect(delta.config.data.labels).toEqual(["​Group One", "x1 (baseline)", "​g2", "y1 (baseline)"]);
  });

  it("keeps the keys when no labels are given", () => {
    const { config, table } = createSummaryChartConfiguration(grouped, {
      aggregationStrategy: AggregationStrategy.AVERAGE,
      metrics: [MetricEnum.WHOLE_UPDATE],
      groupBy: ["g1", "g2"],
    });
    expect(config.data.labels).toEqual(["​g1", "x1", "​g2", "y1"]);
    expect(table.rows.map(row => row[0])).toEqual(["g1", "g2"]);
  });

  it("shows the label in the entity-summary heading", () => {
    const { config } = createEntityBreakdownChartConfiguration(grouped, {
      aggregationStrategy: AggregationStrategy.AVERAGE,
      groupBy: ["g1", "g2"],
      groupLabels: labels,
    });
    expect(config.data.labels).toEqual(["​Group One", "x1", "​g2", "y1"]);
  });

  it("shows the label in paired headings and the Group column", () => {
    const item = (label: string, session: string, total: number, group: string): PairedItem =>
      ({ label, session, group, total, segments: new Map() });
    const layout = buildPaired(
      [item("p", "a", 100, "g1"), item("p", "b", 110, "g1"), item("q", "a", 200, "g2"), item("q", "b", 190, "g2")],
      [],
      { sessions: ["a", "b"], groupBy: ["g1", "g2"], groupLabels: labels, sort: "total", singleBar: true, digits: 0, totalLabel: "Whole", spacerPrefix: "​" },
    );
    expect(layout.labels).toEqual(["​Group One", "p", "​g2", "q"]);
    expect(layout.table.rows.map(row => row[0])).toEqual(["Group One", "g2"]);
  });
});
