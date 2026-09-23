import { describe, it, expect } from "vitest";
import { average, standardDeviation, median, min, max, percentDecrease, formatSlowdown } from "../utils";

describe("average", () => {
  it("returns the arithmetic mean of an array", () => {
    expect(average([1, 2, 3])).toBe(2);
  });

  it("handles a single element", () => {
    expect(average([7])).toBe(7);
  });

  it("handles zeros", () => {
    expect(average([0, 0, 0])).toBe(0);
  });
});

describe("standardDeviation", () => {
  it("returns 0 for a constant array", () => {
    expect(standardDeviation([5, 5, 5])).toBe(0);
  });

  it("computes population std dev correctly", () => {
    // [2,4,4,4,5,5,7,9] => mean 5, variance 4, stddev 2
    expect(standardDeviation([2, 4, 4, 4, 5, 5, 7, 9])).toBe(2);
  });

  it("handles a single element", () => {
    expect(standardDeviation([42])).toBe(0);
  });
});

describe("median", () => {
  it("returns the middle value for an odd-length array", () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  it("returns the average of the two middle values for an even-length array", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("handles a single element", () => {
    expect(median([7])).toBe(7);
  });

  it("is not sensitive to input order", () => {
    expect(median([5, 1, 3])).toBe(3);
  });

  it("throws for an empty array", () => {
    expect(() => median([])).toThrow("cannot compute median of an empty array");
  });
});

describe("min / max", () => {
  it("returns the minimum value", () => {
    expect(min([3, 1, 4, 1, 5])).toBe(1);
  });

  it("returns the maximum value", () => {
    expect(max([3, 1, 4, 1, 5])).toBe(5);
  });

  it("handles a single element", () => {
    expect(min([42])).toBe(42);
    expect(max([42])).toBe(42);
  });
});

describe("percentDecrease", () => {
  it("returns 20 for a decrease from 100 to 80", () => {
    expect(percentDecrease(100, 80)).toBe(20);
  });

  it("returns a negative value when the value increases", () => {
    expect(percentDecrease(80, 100)).toBeCloseTo(-25);
  });

  it("returns 0 when values are equal", () => {
    expect(percentDecrease(50, 50)).toBe(0);
  });

  it("returns 100 for a total decrease to zero", () => {
    expect(percentDecrease(100, 0)).toBe(100);
  });
});

describe("formatSlowdown", () => {
  it("returns a signed percent for an increase under +100%", () => {
    expect(formatSlowdown(188, 197)).toBe("+4.8%");
    expect(formatSlowdown(188, 208)).toBe("+10.6%");
    expect(formatSlowdown(188, 292)).toBe("+55.3%");
  });

  it("switches to an Nx multiplier at the +100% boundary", () => {
    expect(formatSlowdown(188, 491)).toBe("2.61x");
    expect(formatSlowdown(100, 200)).toBe("2.00x");
  });

  it("returns a signed percent for a decrease (faster than reference)", () => {
    expect(formatSlowdown(197, 188)).toBe("-4.6%");
  });

  it("returns an empty string when there is no reference", () => {
    expect(formatSlowdown(null, 100)).toBe("");
    expect(formatSlowdown(0, 100)).toBe("");
  });
});
