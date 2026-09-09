import { describe, it, expect } from "vitest";
import { getCoreFrequencyStatValue, CoreFrequencyStat } from "../data/CpuFrequencyResult";
import { AggregationStrategy } from "../data/AggregationStrategy";

const stat: CoreFrequencyStat = {
  coreIndex: 0,
  average: 4600,
  median: 4610,
  minimum: 4400,
  maximum: 4700,
  standardDeviation: 25,
};

describe("getCoreFrequencyStatValue", () => {
  it("returns average", () => {
    expect(getCoreFrequencyStatValue(stat, AggregationStrategy.AVERAGE)).toBe(4600);
  });

  it("returns median", () => {
    expect(getCoreFrequencyStatValue(stat, AggregationStrategy.MEDIAN)).toBe(4610);
  });

  it("returns minimum", () => {
    expect(getCoreFrequencyStatValue(stat, AggregationStrategy.MINIMUM)).toBe(4400);
  });

  it("returns maximum", () => {
    expect(getCoreFrequencyStatValue(stat, AggregationStrategy.MAXIMUM)).toBe(4700);
  });

  it("returns standard deviation", () => {
    expect(getCoreFrequencyStatValue(stat, AggregationStrategy.STANDARD_DEVIATION)).toBe(25);
  });
});
