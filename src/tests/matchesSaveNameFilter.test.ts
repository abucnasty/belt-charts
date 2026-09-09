import { describe, it, expect } from "vitest";
import { matchesSaveNameFilter } from "../data/CpuFrequencyResult";

describe("matchesSaveNameFilter", () => {
  it("matches everything when no patterns are given", () => {
    expect(matchesSaveNameFilter("ship_benchmark_50_aligned", [])).toBe(true);
  });

  it("matches a glob wildcard pattern", () => {
    expect(matchesSaveNameFilter("ship_benchmark_50_aligned", ["ship_benchmark_50_*"])).toBe(true);
  });

  it("rejects a save_name that doesn't match any pattern", () => {
    expect(matchesSaveNameFilter("utility_science_baseline", ["ship_benchmark_50_*"])).toBe(false);
  });

  it("OR-matches across multiple patterns", () => {
    const patterns = ["ship_benchmark_50_aligned", "utility_science_*"];
    expect(matchesSaveNameFilter("ship_benchmark_50_aligned", patterns)).toBe(true);
    expect(matchesSaveNameFilter("utility_science_baseline", patterns)).toBe(true);
    expect(matchesSaveNameFilter("ship_benchmark_50_nonaligned", patterns)).toBe(false);
  });

  it("supports negation-free exact match with no glob metacharacters", () => {
    expect(matchesSaveNameFilter("exact_name", ["exact_name"])).toBe(true);
    expect(matchesSaveNameFilter("exact_name_2", ["exact_name"])).toBe(false);
  });
});
