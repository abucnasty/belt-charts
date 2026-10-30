import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseBenchmarkAggregatesPerRunResultFromCsv } from "../data/BenchmarkAggregateResult";
import { parseBenchmarkAveragePerTickResultFromCsv } from "../data/BenchmarkTickResult";
import { MetricEnum } from "../data/MetricEnum";
import { average, max, median, min, standardDeviation } from "../utils";

// run, tick, wholeUpdate, entityUpdate, Inserter
const ROWS: [number, number, number, number, number][] = [
  [1, 1, 100, 50, 0],
  [1, 2, 120, 60, 5],
  [1, 3, 140, 70, 0],
  [2, 1, 200, 80, 0],
  [2, 2, 220, 90, 7],
  [2, 3, 240, 0, 9],
];

let dir: string;
let file: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "belt-charts-"));
  file = path.join(dir, "test_map_verbose_metrics.csv");
  const lines = ["tick,run,wholeUpdate,entityUpdate,Inserter"];
  for (const [run, tick, ...values] of ROWS) lines.push([tick, run, ...values].join(","));
  fs.writeFileSync(file, lines.join("\n") + "\n");
});

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const reference = (values: number[]) => ({
  average: average(values),
  standardDeviation: standardDeviation(values),
  minimum: min(values),
  maximum: max(values),
  median: median(values),
});

describe("parseBenchmarkAggregatesPerRunResultFromCsv", () => {
  const metrics = [MetricEnum.WHOLE_UPDATE, MetricEnum.ENTITY_UPDATE, MetricEnum.INSERTER];

  it("computes per-run and whole-file stats for each metric", async () => {
    const result = await parseBenchmarkAggregatesPerRunResultFromCsv(file, 1, 0, metrics, new Set());
    expect(result.originalFileName).toBe("test_map");

    metrics.forEach((metric, i) => {
      const column = (row: (typeof ROWS)[number]) => row[2 + i];
      const kept = ROWS.filter((r) => r[1] > 1);
      for (const run of [1, 2]) {
        const runAgg = result.runs.get(metric.name)!.find((a) => a.run === run)!;
        expect(runAgg).toEqual({ ...reference(kept.filter((r) => r[0] === run).map(column)), run });
      }
      const all = result.all.get(metric.name)!;
      const expected = reference(kept.map(column));
      expect(all.average).toBeCloseTo(expected.average, 9);
      expect(all.standardDeviation).toBeCloseTo(expected.standardDeviation, 9);
      expect(all.minimum).toBe(expected.minimum);
      expect(all.maximum).toBe(expected.maximum);
      expect(all.median).toBe(expected.median);
    });
  });

  it("drops removed runs", async () => {
    const result = await parseBenchmarkAggregatesPerRunResultFromCsv(file, 0, 0, metrics, new Set([2]));
    expect(result.runs.get("wholeUpdate")!.map((a) => a.run)).toEqual([1]);
    expect(result.all.get("wholeUpdate")!.average).toBe(120);
  });
});

describe("parseBenchmarkAveragePerTickResultFromCsv", () => {
  it("computes per-tick stats across runs for only the requested metrics", async () => {
    const result = await parseBenchmarkAveragePerTickResultFromCsv(file, new Set(), 0, new Set(["Inserter"]));
    expect(result.metrics.map((m) => m.name)).toEqual(["wholeUpdate", "Inserter"]);

    const whole = result.metricTickStats.get("wholeUpdate")!;
    expect(whole.map((s) => s.tick)).toEqual([1, 2, 3]);
    expect(whole[1]).toEqual({ ...reference([120, 220]), tick: 2 });
    expect(result.metricTickStats.get("Inserter")![2]).toEqual({ ...reference([0, 9]), tick: 3 });
  });

  it("treats maxTicks = 0 as no limit", async () => {
    const result = await parseBenchmarkAveragePerTickResultFromCsv(file, new Set(), 0);
    expect(result.metricTickStats.get("wholeUpdate")!.length).toBe(3);
  });

  it("drops ticks above a positive maxTicks", async () => {
    const result = await parseBenchmarkAveragePerTickResultFromCsv(file, new Set(), 2);
    expect(result.metricTickStats.get("wholeUpdate")!.map((s) => s.tick)).toEqual([1, 2]);
  });
});
