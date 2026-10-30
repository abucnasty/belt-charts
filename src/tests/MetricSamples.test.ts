import { describe, it, expect } from "vitest";
import { MetricSamples } from "../data/MetricSamples";
import { average, max, median, min, standardDeviation } from "../utils";

const samplesOf = (values: number[]): MetricSamples => {
  const samples = new MetricSamples();
  values.forEach((v) => samples.push(v));
  return samples;
};

const expectMatchesReference = (samples: MetricSamples, values: number[]) => {
  const agg = samples.aggregate();
  expect(agg.average).toBeCloseTo(average(values), 9);
  expect(agg.standardDeviation).toBeCloseTo(standardDeviation(values), 9);
  expect(agg.minimum).toBe(min(values));
  expect(agg.maximum).toBe(max(values));
  expect(agg.median).toBe(median(values));
};

describe("MetricSamples", () => {
  it("matches the reference stats for an odd-length set", () => {
    const values = [5, 1, 9, 3, 7];
    expectMatchesReference(samplesOf(values), values);
  });

  it("matches the reference stats for an even-length set", () => {
    const values = [4, 8, 1, 2];
    expectMatchesReference(samplesOf(values), values);
  });

  it("handles zeros (counted, not stored) mixed with negative and positive values", () => {
    const values = [0, -3, 0, 5, 0, 0, -1, 2, 0];
    expectMatchesReference(samplesOf(values), values);
  });

  it("handles an all-zero set", () => {
    const values = [0, 0, 0, 0];
    expectMatchesReference(samplesOf(values), values);
  });

  it("grows past its initial capacity", () => {
    const values = Array.from({ length: 5000 }, (_, i) => (i * 7919) % 1013);
    const samples = samplesOf(values);
    expect(samples.count).toBe(5000);
    expectMatchesReference(samples, values);
  });

  it("merges sample sets, including ones already aggregated (sorted in place)", () => {
    const a = [3, 0, 1];
    const b = [0, 10, -2, 4];
    const sa = samplesOf(a);
    const sb = samplesOf(b);
    sa.aggregate();
    const merged = MetricSamples.merge([sa, sb]);
    expect(merged.count).toBe(7);
    expectMatchesReference(merged, [...a, ...b]);
  });

  it("throws for an empty set", () => {
    expect(() => new MetricSamples().aggregate()).toThrow("empty");
  });
});
