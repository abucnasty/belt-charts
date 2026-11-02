import { minimatch } from "minimatch";

/** One `--input` argument (or the positional glob): a glob plus an optional label suffix. */
export type InputSpec = {
  glob: string;
  suffix?: string;
};

/** One resolved results file together with the label suffix of the input it came from. */
export type ChartInput = {
  file: string;
  suffix?: string;
};

/**
 * Parses `<glob>` or `<glob>:<suffix>`. The suffix is whatever follows the last `:`, unless that
 * text looks like part of a path (contains a path separator, as in `C:\data\*.csv` or `C:/data`)
 * or is empty, in which case the whole argument is the glob.
 */
export function parseInputSpec(raw: string): InputSpec {
  const idx = raw.lastIndexOf(":");
  if (idx === -1) return { glob: raw };
  const glob = raw.slice(0, idx);
  const suffix = raw.slice(idx + 1);
  if (glob.length === 0 || suffix.length === 0 || /[\\/]/.test(suffix)) return { glob: raw };
  return { glob, suffix };
}

// Extglobs are off so a label's parentheses, as in "As Saved (mimalloc)", match literally.
const MATCH_OPTIONS = { noext: true };

export type InputFilter = {
  include: string[];
  exclude: string[];
};

/**
 * Applies `--include` / `--exclude` glob patterns. A pattern matches an input when it matches any
 * of that input's `candidates` (its base name and the labels shown in the chart). An input is kept
 * when it matches at least one include pattern (or none were given) and no exclude pattern.
 * `unmatchedIncludes` lists include patterns that matched nothing, so callers can warn.
 */
export function filterInputs(
  inputs: ChartInput[],
  filter: InputFilter,
  candidatesOf: (input: ChartInput) => string[],
): { kept: ChartInput[]; unmatchedIncludes: string[]; unmatchedExcludes: string[] } {
  const matches = (input: ChartInput, pattern: string): boolean =>
    candidatesOf(input).some((candidate) => minimatch(candidate, pattern, MATCH_OPTIONS));

  const kept = inputs.filter((input) =>
    (filter.include.length === 0 || filter.include.some((p) => matches(input, p))) &&
    !filter.exclude.some((p) => matches(input, p)),
  );
  const unmatched = (patterns: string[]) =>
    patterns.filter((p) => !inputs.some((input) => matches(input, p)));
  return {
    kept,
    unmatchedIncludes: unmatched(filter.include),
    unmatchedExcludes: unmatched(filter.exclude),
  };
}

/**
 * Orders inputs for `--sort input`. Inputs that share a base name (the same save in several
 * input globs) stay next to each other, so sessions of one save are read together. Base names are
 * ranked by: `--include` pattern order, then names-file/`--name` order, then first appearance.
 * Within one base name the order of the input globs is kept.
 */
export function orderInputs(
  inputs: ChartInput[],
  baseNameOf: (input: ChartInput) => string,
  includePatterns: string[],
  candidatesOf: (input: ChartInput) => string[],
  nameOrder: string[],
): ChartInput[] {
  const ranking: string[] = [];
  const rank = (baseName: string) => {
    if (!ranking.includes(baseName)) ranking.push(baseName);
  };
  for (const pattern of includePatterns) {
    for (const input of inputs) {
      if (candidatesOf(input).some((candidate) => minimatch(candidate, pattern, MATCH_OPTIONS))) rank(baseNameOf(input));
    }
  }
  nameOrder.forEach((name) => {
    if (inputs.some((input) => baseNameOf(input) === name)) rank(name);
  });
  inputs.forEach((input) => rank(baseNameOf(input)));

  // Array.prototype.sort is stable, so equal ranks keep their original (input glob) order.
  return [...inputs].sort((a, b) => ranking.indexOf(baseNameOf(a)) - ranking.indexOf(baseNameOf(b)));
}
