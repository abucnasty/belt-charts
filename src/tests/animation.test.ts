import { describe, it, expect } from "vitest";
import type { ChartConfiguration } from "chart.js";
import type { IBoxPlot } from "@sgratzl/chartjs-chart-boxplot";
import {
  applyEasing,
  frameCount,
  scaleCategoricalForAnimation,
  scaleBoxplotForAnimation,
  revealTimeseriesForAnimation,
} from "../charts/animation";

describe("applyEasing", () => {
  it("linear passes through unchanged", () => {
    expect(applyEasing(0, "linear")).toBe(0);
    expect(applyEasing(0.5, "linear")).toBe(0.5);
    expect(applyEasing(1, "linear")).toBe(1);
  });

  it("clamps values outside [0,1]", () => {
    expect(applyEasing(-1, "linear")).toBe(0);
    expect(applyEasing(2, "linear")).toBe(1);
  });

  it("ease-out and ease-in-out hit the same endpoints as linear", () => {
    for (const easing of ["ease-out", "ease-in-out"] as const) {
      expect(applyEasing(0, easing)).toBe(0);
      expect(applyEasing(1, easing)).toBe(1);
    }
  });

  it("ease-out front-loads progress (above the diagonal at the midpoint)", () => {
    expect(applyEasing(0.5, "ease-out")).toBeGreaterThan(0.5);
  });

  it("ease-in-out is symmetric around the midpoint", () => {
    expect(applyEasing(0.5, "ease-in-out")).toBeCloseTo(0.5, 10);
  });
});

describe("frameCount", () => {
  it("multiplies duration by fps", () => {
    expect(frameCount(3, 30)).toBe(90);
  });

  it("never returns less than 1", () => {
    expect(frameCount(0, 30)).toBe(1);
  });
});

describe("scaleCategoricalForAnimation", () => {
  const baseConfig = {
    type: "bar",
    data: {
      labels: ["a", "b"],
      datasets: [{ label: "d1", data: [10, 20] }],
    },
    options: {},
  } as unknown as ChartConfiguration<"bar">;

  it("scales every numeric value by progress", () => {
    const result = scaleCategoricalForAnimation(baseConfig, 0.5);
    expect(result.data.datasets[0].data).toEqual([5, 10]);
  });

  it("does not mutate the input config", () => {
    scaleCategoricalForAnimation(baseConfig, 0.5);
    expect(baseConfig.data.datasets[0].data).toEqual([10, 20]);
  });

  it("progress 1 reproduces the original values", () => {
    const result = scaleCategoricalForAnimation(baseConfig, 1);
    expect(result.data.datasets[0].data).toEqual([10, 20]);
  });

  it("pins the unfixed value axis to the final stacked total so growth is visible", () => {
    const stackedConfig = {
      type: "bar",
      options: { indexAxis: "y" },
      data: {
        labels: ["a", "b"],
        datasets: [
          { label: "d1", data: [10, 20] },
          { label: "d2", data: [5, 30] },
        ],
      },
    } as unknown as ChartConfiguration<"bar">;

    const result = scaleCategoricalForAnimation(stackedConfig, 0.5);
    expect(result.options?.scales?.x).toMatchObject({ max: 50 });
    expect(result.data.datasets[0].data).toEqual([5, 10]);
    expect(result.data.datasets[1].data).toEqual([2.5, 15]);
  });

  it("leaves an already-fixed value axis max untouched", () => {
    const fixedConfig = {
      type: "bar",
      options: { indexAxis: "y", scales: { x: { max: 999 } } },
      data: { labels: ["a"], datasets: [{ label: "d1", data: [10] }] },
    } as unknown as ChartConfiguration<"bar">;

    const result = scaleCategoricalForAnimation(fixedConfig, 0.5);
    expect(result.options?.scales?.x).toMatchObject({ max: 999 });
  });
});

describe("scaleBoxplotForAnimation", () => {
  const stats: IBoxPlot = {
    min: 10, q1: 20, median: 30, q3: 40, max: 50,
    whiskerMin: 5, whiskerMax: 55, mean: 30,
    items: [10, 20, 30, 40, 50],
    outliers: [1, 100],
  };
  const baseConfig = {
    type: "boxplot",
    data: { labels: ["a"], datasets: [{ label: "d1", data: [stats] }] },
    options: {},
  } as unknown as ChartConfiguration<"boxplot">;

  it("scales every numeric field by progress", () => {
    const result = scaleBoxplotForAnimation(baseConfig, 0.5);
    const scaled = result.data.datasets[0].data[0] as unknown as IBoxPlot;
    expect(scaled).toEqual({
      min: 5, q1: 10, median: 15, q3: 20, max: 25,
      whiskerMin: 2.5, whiskerMax: 27.5, mean: 15,
      items: [5, 10, 15, 20, 25],
      outliers: [0.5, 50],
    });
  });

  it("does not mutate the input config", () => {
    scaleBoxplotForAnimation(baseConfig, 0.5);
    expect(baseConfig.data.datasets[0].data[0]).toEqual(stats);
  });
});

describe("revealTimeseriesForAnimation", () => {
  const baseConfig = {
    type: "line",
    data: {
      labels: [0, 1, 2, 3],
      datasets: [{ label: "d1", data: [{ x: 0, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 3 }, { x: 3, y: 4 }] }],
    },
    options: {},
  } as unknown as ChartConfiguration<"line">;

  it("truncates data and labels to a progress-scaled prefix", () => {
    const result = revealTimeseriesForAnimation(baseConfig, 0.5);
    expect(result.data.labels).toEqual([0, 1]);
    expect(result.data.datasets[0].data).toEqual([{ x: 0, y: 1 }, { x: 1, y: 2 }]);
  });

  it("keeps at least one point at progress 0", () => {
    const result = revealTimeseriesForAnimation(baseConfig, 0);
    expect(result.data.datasets[0].data).toEqual([{ x: 0, y: 1 }]);
  });

  it("keeps every point at progress 1", () => {
    const result = revealTimeseriesForAnimation(baseConfig, 1);
    expect(result.data.datasets[0].data).toHaveLength(4);
  });

  it("does not mutate the input config", () => {
    revealTimeseriesForAnimation(baseConfig, 0.5);
    expect(baseConfig.data.datasets[0].data).toHaveLength(4);
  });

  it("pins the x-axis to the full data's domain regardless of progress", () => {
    for (const progress of [0, 0.25, 0.5, 1]) {
      const result = revealTimeseriesForAnimation(baseConfig, progress);
      expect(result.options?.scales?.x).toMatchObject({ min: 0, max: 3 });
    }
  });

  it("derives the x domain from {x,y} points when labels aren't numeric", () => {
    const pointOnlyConfig = {
      type: "line",
      data: {
        labels: ["a", "b", "c"],
        datasets: [{ label: "d1", data: [{ x: 10, y: 1 }, { x: 20, y: 2 }, { x: 30, y: 3 }] }],
      },
      options: {},
    } as unknown as ChartConfiguration<"line">;

    const result = revealTimeseriesForAnimation(pointOnlyConfig, 0.5);
    expect(result.options?.scales?.x).toMatchObject({ min: 10, max: 30 });
  });

  it("leaves an already-fixed x-axis domain untouched", () => {
    const fixedConfig = {
      type: "line",
      data: baseConfig.data,
      options: { scales: { x: { min: -5, max: 5 } } },
    } as unknown as ChartConfiguration<"line">;

    const result = revealTimeseriesForAnimation(fixedConfig, 0.5);
    expect(result.options?.scales?.x).toMatchObject({ min: -5, max: 5 });
  });
});
