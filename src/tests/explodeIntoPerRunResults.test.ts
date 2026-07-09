import { describe, it, expect } from "vitest";
import {
  explodeIntoPerRunResults,
  BenchmarkAggregateRunResult,
  MetricAggregate,
  MetricRunAggregate,
} from "../data/BenchmarkAggregateResult";
import { AggregationStrategy } from "../data/AggregationStrategy";
import { MetricEnum } from "../data/MetricEnum";

const makeAggregate = (average: number, overrides: Partial<MetricAggregate> = {}): MetricAggregate => ({
  average,
  standardDeviation: 50,
  minimum: average - 100,
  maximum: average + 100,
  median: average,
  ...overrides,
});

const makeRunAggregate = (run: number, average: number): MetricRunAggregate => ({
  ...makeAggregate(average, { minimum: average - 100, maximum: average + 100, median: average - 10 }),
  run,
});

const makeResult = (): BenchmarkAggregateRunResult => ({
  originalFileName: "test-map",
  displayName: "test-map",
  metrics: [MetricEnum.ENTITY_UPDATE, MetricEnum.WHOLE_UPDATE],
  runs: new Map([
    [MetricEnum.ENTITY_UPDATE.name, [makeRunAggregate(1, 1000), makeRunAggregate(2, 2000)]],
    [MetricEnum.WHOLE_UPDATE.name, [makeRunAggregate(1, 5000), makeRunAggregate(2, 9000)]],
  ]),
  all: new Map([
    [MetricEnum.ENTITY_UPDATE.name, makeAggregate(1500)],
    [MetricEnum.WHOLE_UPDATE.name, makeAggregate(7000)],
  ]),
});

describe("explodeIntoPerRunResults", () => {
  it("produces one entry per run", () => {
    expect(explodeIntoPerRunResults(makeResult(), AggregationStrategy.AVERAGE)).toHaveLength(2);
  });

  it("names each result with the source displayName and run number", () => {
    const result = explodeIntoPerRunResults(makeResult(), AggregationStrategy.AVERAGE);
    expect(result[0].displayName).toBe("test-map (run 1)");
    expect(result[1].displayName).toBe("test-map (run 2)");
  });

  it("preserves originalFileName unchanged on each per-run result", () => {
    const result = explodeIntoPerRunResults(makeResult(), AggregationStrategy.AVERAGE);
    expect(result[0].originalFileName).toBe("test-map");
    expect(result[1].originalFileName).toBe("test-map");
  });

  it("sorts results by run number ascending", () => {
    const reversed: BenchmarkAggregateRunResult = {
      originalFileName: "m",
      displayName: "m",
      metrics: [MetricEnum.WHOLE_UPDATE],
      runs: new Map([
        [MetricEnum.WHOLE_UPDATE.name, [makeRunAggregate(3, 3000), makeRunAggregate(1, 1000)]],
      ]),
      all: new Map([[MetricEnum.WHOLE_UPDATE.name, makeAggregate(2000)]]),
    };
    const result = explodeIntoPerRunResults(reversed, AggregationStrategy.AVERAGE);
    expect(result[0].displayName).toContain("run 1");
    expect(result[1].displayName).toContain("run 3");
  });

  it("propagates a pre-labeled displayName into the per-run label", () => {
    const labeled: BenchmarkAggregateRunResult = {
      originalFileName: "raw_source_file",
      displayName: "Custom Label",
      metrics: [MetricEnum.WHOLE_UPDATE],
      runs: new Map([
        [MetricEnum.WHOLE_UPDATE.name, [makeRunAggregate(1, 5000), makeRunAggregate(2, 6000)]],
      ]),
      all: new Map([[MetricEnum.WHOLE_UPDATE.name, makeAggregate(5500)]]),
    };
    const result = explodeIntoPerRunResults(labeled, AggregationStrategy.AVERAGE);
    expect(result[0].displayName).toBe("Custom Label (run 1)");
    expect(result[1].displayName).toBe("Custom Label (run 2)");
    // originalFileName stays intact so downstream lookups still work
    expect(result[0].originalFileName).toBe("raw_source_file");
    expect(result[1].originalFileName).toBe("raw_source_file");
  });

  it("each result has an empty runs map", () => {
    const result = explodeIntoPerRunResults(makeResult(), AggregationStrategy.AVERAGE);
    result.forEach(r => expect(r.runs.size).toBe(0));
  });

  it("preserves the source metrics array", () => {
    const result = explodeIntoPerRunResults(makeResult(), AggregationStrategy.AVERAGE);
    expect(result[0].metrics).toEqual([MetricEnum.ENTITY_UPDATE, MetricEnum.WHOLE_UPDATE]);
  });

  describe("aggregation strategy", () => {
    it("AVERAGE: maps average to the 'average' field", () => {
      const result = explodeIntoPerRunResults(makeResult(), AggregationStrategy.AVERAGE);
      expect(result[0].all.get(MetricEnum.WHOLE_UPDATE.name)?.average).toBe(5000);
      expect(result[1].all.get(MetricEnum.WHOLE_UPDATE.name)?.average).toBe(9000);
    });

    it("MINIMUM: maps minimum to the 'average' field", () => {
      const result = explodeIntoPerRunResults(makeResult(), AggregationStrategy.MINIMUM);
      // minimum = average - 100
      expect(result[0].all.get(MetricEnum.WHOLE_UPDATE.name)?.average).toBe(4900);
      expect(result[1].all.get(MetricEnum.WHOLE_UPDATE.name)?.average).toBe(8900);
    });

    it("MAXIMUM: maps maximum to the 'average' field", () => {
      const result = explodeIntoPerRunResults(makeResult(), AggregationStrategy.MAXIMUM);
      // maximum = average + 100
      expect(result[0].all.get(MetricEnum.WHOLE_UPDATE.name)?.average).toBe(5100);
      expect(result[1].all.get(MetricEnum.WHOLE_UPDATE.name)?.average).toBe(9100);
    });

    it("MEDIAN: maps median to the 'average' field", () => {
      const result = explodeIntoPerRunResults(makeResult(), AggregationStrategy.MEDIAN);
      // median = average - 10
      expect(result[0].all.get(MetricEnum.WHOLE_UPDATE.name)?.average).toBe(4990);
      expect(result[1].all.get(MetricEnum.WHOLE_UPDATE.name)?.average).toBe(8990);
    });

    it("STANDARD_DEVIATION: maps standardDeviation to the 'average' field", () => {
      const result = explodeIntoPerRunResults(makeResult(), AggregationStrategy.STANDARD_DEVIATION);
      expect(result[0].all.get(MetricEnum.WHOLE_UPDATE.name)?.average).toBe(50);
    });
  });
});
