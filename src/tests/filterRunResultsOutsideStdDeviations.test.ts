import { describe, it, expect } from "vitest";
import { filterRunResultsOutsideStdDeviations, RunResultRow } from "../data/ResultsFile";

const makeRow = (avg_ms: number, run_index: number = 0): RunResultRow => ({
  save_name: "test",
  run_index,
  execution_time_ms: avg_ms * 100,
  avg_ms,
  min_ms: avg_ms * 0.9,
  max_ms: avg_ms * 1.1,
  effective_ups: 60,
  ticks: 1000,
  factorio_version: "2.0.0",
  platform: "linux",
});

describe("filterRunResultsOutsideStdDeviations", () => {
  it("keeps all rows when all are within the default 3σ window", () => {
    const rows = [100, 101, 99, 100, 102].map(makeRow);
    const { keep, remove } = filterRunResultsOutsideStdDeviations("test", rows);
    expect(keep).toHaveLength(5);
    expect(remove).toHaveLength(0);
  });

  it("removes a clear outlier beyond 3σ", () => {
    // 10 clustered values + 1 extreme outlier: 10000 is outside mean + 3σ
    const rows = [...Array(10).fill(100).map(makeRow), makeRow(10000)];
    const { remove } = filterRunResultsOutsideStdDeviations("test", rows);
    expect(remove).toHaveLength(1);
    expect(remove[0].avg_ms).toBe(10000);
  });

  it("keeps the non-outlier rows when there is one outlier", () => {
    const rows = [...Array(10).fill(100).map(makeRow), makeRow(10000)];
    const { keep } = filterRunResultsOutsideStdDeviations("test", rows);
    expect(keep.every(r => r.avg_ms !== 10000)).toBe(true);
  });

  it("propagates the saveName", () => {
    const { saveName } = filterRunResultsOutsideStdDeviations("my-save", [makeRow(100)]);
    expect(saveName).toBe("my-save");
  });

  it("respects a tighter custom standardDeviations threshold", () => {
    // σ=1 — 200 is far enough from 100 to be filtered at 1σ
    const rows = [100, 100, 100, 200].map(makeRow);
    const { remove } = filterRunResultsOutsideStdDeviations("test", rows, 1);
    expect(remove.some(r => r.avg_ms === 200)).toBe(true);
  });

  it("handles a single-element array without throwing", () => {
    const rows = [makeRow(100)];
    const { keep, remove } = filterRunResultsOutsideStdDeviations("test", rows);
    expect(keep).toHaveLength(1);
    expect(remove).toHaveLength(0);
  });
});
