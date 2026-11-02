export type ErrorBarMode = "stddev" | "ci95" | "minmax";

export const ERROR_BAR_MODES: readonly ErrorBarMode[] = ["stddev", "ci95", "minmax"];

/** An interval around a plotted value, in the plotted unit. */
export type ErrorBar = {
  lower: number;
  upper: number;
};

// Two-sided 95% critical values of Student's t by degrees of freedom (1..30).
const T_95 = [
  12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228,
  2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086,
  2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042,
];

export function tCritical95(degreesOfFreedom: number): number {
  if (degreesOfFreedom <= 30) return T_95[degreesOfFreedom - 1];
  if (degreesOfFreedom <= 40) return 2.021;
  if (degreesOfFreedom <= 60) return 2.0;
  if (degreesOfFreedom <= 120) return 1.98;
  return 1.96;
}

/** Sample standard deviation (n - 1), for run means that are a sample of possible runs. */
export function sampleStandardDeviation(values: number[]): number {
  const n = values.length;
  const mean = values.reduce((sum, v) => sum + v, 0) / n;
  return Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (n - 1));
}

/**
 * Spread of the per-run means of one row, drawn around `center` (the plotted value).
 * - `stddev`: center +/- the sample standard deviation of the run means.
 * - `ci95`: center +/- the half-width of the 95% confidence interval of their mean (Student's t).
 * - `minmax`: from the smallest to the largest run mean (not centered).
 * Returns null when there are too few runs for the statistic (stddev and ci95 need two).
 */
export function computeErrorBar(runMeans: number[], mode: ErrorBarMode, center: number): ErrorBar | null {
  if (runMeans.length === 0) return null;
  if (mode === "minmax") return { lower: Math.min(...runMeans), upper: Math.max(...runMeans) };
  if (runMeans.length < 2) return null;
  const sd = sampleStandardDeviation(runMeans);
  const half = mode === "stddev" ? sd : tCritical95(runMeans.length - 1) * sd / Math.sqrt(runMeans.length);
  return { lower: center - half, upper: center + half };
}

/** True when two intervals share any point; how "within run-to-run noise of each other" is decided. */
export function errorBarsOverlap(a: ErrorBar, b: ErrorBar): boolean {
  return a.lower <= b.upper && b.lower <= a.upper;
}

/** Table columns for a row's error bar, matching `errorBarColumns`. */
export function errorBarCells(bar: ErrorBar | null, mode: ErrorBarMode, digits = 1): string[] {
  if (bar === null) return mode === "minmax" ? ["", ""] : [""];
  return mode === "minmax"
    ? [bar.lower.toFixed(digits), bar.upper.toFixed(digits)]
    : [((bar.upper - bar.lower) / 2).toFixed(digits)];
}

/** Table headers for the error-bar columns, plus the overlap column. */
export function errorBarColumns(mode: ErrorBarMode, label: string): string[] {
  switch (mode) {
    case "stddev": return [`${label} ± Std Dev`, "Overlaps Prev"];
    case "ci95": return [`${label} ± 95% CI`, "Overlaps Prev"];
    case "minmax": return [`${label} Min Run`, `${label} Max Run`, "Overlaps Prev"];
  }
}

/** "yes"/"no" whether this row's bar overlaps the previous row's; empty for the first row or missing bars. */
export function overlapCell(previous: ErrorBar | null | undefined, current: ErrorBar | null): string {
  if (!previous || !current) return "";
  return errorBarsOverlap(previous, current) ? "yes" : "no";
}
