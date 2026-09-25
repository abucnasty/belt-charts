import type { ChartConfiguration } from "chart.js";
import type { IBoxPlot } from "@sgratzl/chartjs-chart-boxplot";

export type Easing = "linear" | "ease-out" | "ease-in-out";

/** Maps t in [0,1] (clamped) to an eased progress value in [0,1]. */
export function applyEasing(t: number, easing: Easing): number {
  const clamped = Math.min(1, Math.max(0, t));
  switch (easing) {
    case "linear":
      return clamped;
    case "ease-out":
      return 1 - Math.pow(1 - clamped, 3);
    case "ease-in-out":
      return clamped < 0.5 ? 4 * Math.pow(clamped, 3) : 1 - Math.pow(-2 * clamped + 2, 3) / 2;
  }
}

export function frameCount(durationSeconds: number, fps: number): number {
  return Math.max(1, Math.round(durationSeconds * fps));
}

/**
 * Grows every numeric value in every dataset's `data` array from 0 to its final value. Used
 * for bar/stacked-bar charts. Chart.js auto-scales an unfixed value axis to the CURRENT
 * (shrunken) data every frame, which would hide the growth entirely — so when the config
 * doesn't already pin the value axis to a fixed max (e.g. via --max-update), this computes
 * the final stacked total up front and pins it for every frame.
 */
export function scaleCategoricalForAnimation(
  config: ChartConfiguration<"bar">,
  progress: number,
): ChartConfiguration<"bar"> {
  const valueAxisKey = config.options?.indexAxis === "y" ? "x" : "y";
  const scales = (config.options?.scales ?? {}) as Record<string, { max?: number } | undefined>;
  const existingMax = scales[valueAxisKey]?.max;

  const datasets = config.data.datasets.map((dataset) => ({
    ...dataset,
    data: (dataset.data as unknown as number[]).map((value) =>
      typeof value === "number" ? value * progress : value,
    ),
  }));

  if (existingMax != null) {
    return { ...config, data: { ...config.data, datasets } };
  }

  const categoryCount = Math.max(0, ...config.data.datasets.map((d) => (d.data as unknown[]).length));
  let fixedMax = 0;
  for (let i = 0; i < categoryCount; i++) {
    let total = 0;
    for (const dataset of config.data.datasets) {
      const value = (dataset.data as unknown as number[])[i];
      if (typeof value === "number") total += value;
    }
    if (total > fixedMax) fixedMax = total;
  }

  return {
    ...config,
    options: {
      ...config.options,
      scales: { ...scales, [valueAxisKey]: { ...scales[valueAxisKey], max: fixedMax } },
    },
    data: { ...config.data, datasets },
  };
}

function scaleBoxPlotStats(stats: IBoxPlot, progress: number): IBoxPlot {
  return {
    ...stats,
    min: stats.min * progress,
    q1: stats.q1 * progress,
    median: stats.median * progress,
    q3: stats.q3 * progress,
    max: stats.max * progress,
    mean: stats.mean * progress,
    whiskerMin: stats.whiskerMin * progress,
    whiskerMax: stats.whiskerMax * progress,
    items: stats.items.map((value) => value * progress),
    outliers: stats.outliers.map((value) => value * progress),
  };
}

/** Grows every quartile/whisker/outlier value in every boxplot dataset entry from 0 to its final value. */
export function scaleBoxplotForAnimation(
  config: ChartConfiguration<"boxplot">,
  progress: number,
): ChartConfiguration<"boxplot"> {
  return {
    ...config,
    data: {
      ...config.data,
      datasets: config.data.datasets.map((dataset) => ({
        ...dataset,
        data: (dataset.data as unknown as IBoxPlot[]).map((stats) => scaleBoxPlotStats(stats, progress)),
      })),
    },
  };
}

/**
 * Reveals time-series datasets left-to-right by masking not-yet-revealed points instead of
 * truncating each dataset's `data`. `labels` and every dataset's `data` array keep their full
 * original length on every frame — if the x-axis were shortened along with the data (as a naive
 * truncate-to-a-prefix approach would do), a category-scale x-axis (chart.js's default here)
 * shrinks to fit only the remaining categories, making it grow over the course of the animation
 * instead of staying fixed.
 */
export function revealTimeseriesForAnimation(
  config: ChartConfiguration<"bar" | "line">,
  progress: number,
): ChartConfiguration<"bar" | "line"> {
  const totalLength = Math.max(1, ...config.data.datasets.map((dataset) => (dataset.data as unknown[]).length));
  const revealCount = Math.max(1, Math.ceil(progress * totalLength));

  // Chart.js's bar controller crashes reading `.x` off a bare `null` array entry (its object-data
  // parser assumes a non-null object), so `{x,y}`-shaped points must stay objects with `y: null`
  // (a value chart.js treats as "no data" for that point); only non-object points fall back to
  // a bare `null` gap.
  const maskPoint = (point: unknown): unknown =>
    point && typeof point === "object" && "x" in point ? { ...(point as object), y: null } : null;

  return {
    ...config,
    data: {
      ...config.data,
      datasets: config.data.datasets.map((dataset) => ({
        ...dataset,
        data: (dataset.data as unknown[]).map((point, i) => (i < revealCount ? point : maskPoint(point))) as typeof dataset.data,
      })),
    },
  };
}
