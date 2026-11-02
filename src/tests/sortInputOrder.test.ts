import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { orderInputs, type ChartInput } from "../commands/inputs";
import { resolveChartInputs } from "../commands/utils";
import { createSummaryChartConfiguration } from "../charts/SummaryChart";
import { createEntityBreakdownChartConfiguration } from "../charts/EntityBreakdownChart";
import { AggregationStrategy } from "../data/AggregationStrategy";
import { MetricEnum } from "../data/MetricEnum";
import { makeResult } from "./fixtures";

const base = (i: ChartInput) => path.basename(i.file, ".csv").replace("_verbose_metrics", "");

describe("orderInputs with a wildcard --include", () => {
  // The glob returned the saves in reverse names-file order.
  const inputs = ["4i-as-saved", "3i-3to1-as-saved", "3i-2to1-as-saved", "4i-shuffled"].map((n): ChartInput => ({ file: `d/${n}_verbose_metrics.csv` }));
  const names = ["3i-2to1-as-saved", "3i-3to1-as-saved", "4i-as-saved", "4i-shuffled"];

  it("orders the saves one pattern matches by the names file", () => {
    const ordered = orderInputs(inputs, base, ["*-as-saved"], i => [base(i)], names);
    expect(ordered.map(base)).toEqual(["3i-2to1-as-saved", "3i-3to1-as-saved", "4i-as-saved", "4i-shuffled"]);
  });

  it("still lets earlier --include patterns come first", () => {
    const ordered = orderInputs(inputs, base, ["4i-*", "*-as-saved"], i => [base(i)], names);
    expect(ordered.map(base)).toEqual(["4i-as-saved", "4i-shuffled", "3i-2to1-as-saved", "3i-3to1-as-saved"]);
  });
});

describe("resolveChartInputs --sort input (ungrouped)", () => {
  let dir: string;
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "belt-charts-order-"));
    for (const n of ["4i-as-saved", "3i-3to1-as-saved", "3i-2to1-as-saved", "4i-shuffled"]) {
      fs.writeFileSync(path.join(dir, `${n}_verbose_metrics.csv`), "tick,run,wholeUpdate\n1,1,1\n");
    }
    fs.writeFileSync(path.join(dir, "names.txt"), "3i-2to1-as-saved=A\n3i-3to1-as-saved=B\n4i-as-saved=C\n4i-shuffled=D\n");
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("follows the names file for an --include wildcard", async () => {
    const { inputs } = await resolveChartInputs(undefined, {
      aggregateFile: "", stddevFilter: 3, output: path.join(dir, "o.png"), fontScale: 1,
      input: [path.join(dir, "*_verbose_metrics.csv")], include: ["*-as-saved"], exclude: [],
      namesFile: path.join(dir, "names.txt"), customNames: new Map(), trimPrefix: "", titleCase: false, trimSubstrings: [],
      sort: "input",
    } as any);
    expect(inputs.map(base)).toEqual(["3i-2to1-as-saved", "3i-3to1-as-saved", "4i-as-saved"]);
  });
});

// Results arrive in input order; the charts must keep it when not grouped.
const inInputOrder = [
  makeResult("c", { wholeUpdate: 3000, entityUpdate: 2000, Inserter: 1000 }),
  makeResult("a", { wholeUpdate: 1000, entityUpdate: 600, Inserter: 300 }),
  makeResult("b", { wholeUpdate: 2000, entityUpdate: 1500, Inserter: 700 }),
];

describe("--sort input keeps the input order without --group-by", () => {
  const summary = (valueMode: "time" | "ups", extra: object = {}) =>
    createSummaryChartConfiguration(inInputOrder, {
      aggregationStrategy: AggregationStrategy.AVERAGE,
      metrics: valueMode === "ups" ? [MetricEnum.WHOLE_UPDATE] : [MetricEnum.WHOLE_UPDATE, MetricEnum.ENTITY_UPDATE],
      valueMode, sort: "input", ...extra,
    });

  for (const valueMode of ["time", "ups"] as const) {
    it(`${valueMode}: chart rows and table rows`, () => {
      const { config, table } = summary(valueMode);
      expect(config.data.labels).toEqual(["c", "a", "b"]);
      expect(table.rows.map(r => r[0])).toEqual(["c", "a", "b"]);
    });
  }

  it("entity-summary, also with --rest-of-tick and --error-bars", () => {
    for (const extra of [{}, { restOfTick: true }, { errorBars: "minmax" as const }]) {
      const { config, table } = createEntityBreakdownChartConfiguration(inInputOrder, {
        aggregationStrategy: AggregationStrategy.AVERAGE, sort: "input", ...extra,
      });
      expect(config.data.labels).toEqual(["c", "a", "b"]);
      expect(table.rows.map(r => r[0])).toEqual(["c", "a", "b"]);
    }
  });
});
