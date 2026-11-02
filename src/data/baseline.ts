import { UserError } from "../utils";

/** A row that can be a baseline: matched by its label or its original base name, within its group. */
export type BaselineRow = {
  displayName: string;
  originalFileName: string;
  group?: string;
};

export type BaselineOptions = {
  /** Label or base name of the baseline row (`--baseline`). */
  baseline?: string | null;
  /** Baseline label or base name per group key (`--baseline-per-group`). */
  baselinePerGroup?: Map<string, string>;
};

/** True when any baseline was requested. */
export function hasBaseline(options: BaselineOptions): boolean {
  return !!options.baseline || (options.baselinePerGroup?.size ?? 0) > 0;
}

/** Parses `--baseline-per-group "key=label,key2=label2"`. Labels cannot contain commas. */
export function parseBaselinePerGroup(text: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const entry of text.split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0 || idx === trimmed.length - 1) {
      throw new UserError(`--baseline-per-group: invalid entry "${trimmed}", expected "<group key>=<label or base name>"`);
    }
    map.set(trimmed.slice(0, idx).trim(), trimmed.slice(idx + 1).trim());
  }
  return map;
}

/**
 * Finds the baseline row for every row. With `--baseline-per-group` a row's baseline is the entry
 * of its group; otherwise `--baseline` names one row, looked up inside the row's own group when
 * results are grouped (so each group compares against its own copy of that save). Throws a
 * `UserError` when a baseline matches no row, or more than one (use the full label then).
 */
export function resolveBaselines(rows: BaselineRow[], options: BaselineOptions): number[] {
  const labelOf = (name: string, group?: string) => group !== undefined ? `"${name}" in group "${group}"` : `"${name}"`;
  const find = (name: string, group: string | undefined, scopeToGroup: boolean): number => {
    const matches: number[] = [];
    rows.forEach((row, idx) => {
      if (scopeToGroup && row.group !== group) return;
      if (row.displayName === name || row.originalFileName === name) matches.push(idx);
    });
    if (matches.length === 1) return matches[0];
    const known = rows.filter(row => !scopeToGroup || row.group === group).map(row => row.displayName).join(", ");
    if (matches.length === 0) {
      throw new UserError(`Baseline ${labelOf(name, scopeToGroup ? group : undefined)} did not match any row (rows: ${known})`);
    }
    throw new UserError(`Baseline ${labelOf(name, scopeToGroup ? group : undefined)} matches ${matches.length} rows; use the full label shown in the chart (rows: ${known})`);
  };

  const cache = new Map<string, number>();
  const cached = (name: string, group: string | undefined, scopeToGroup: boolean): number => {
    const key = `${scopeToGroup ? group : ""}\u0000${name}`;
    if (!cache.has(key)) cache.set(key, find(name, group, scopeToGroup));
    return cache.get(key)!;
  };

  const perGroup = options.baselinePerGroup ?? new Map<string, string>();
  const grouped = rows.some(row => row.group !== undefined);
  return rows.map(row => {
    const groupBaseline = row.group !== undefined ? perGroup.get(row.group) : undefined;
    if (groupBaseline !== undefined) return cached(groupBaseline, row.group, true);
    if (options.baseline) return cached(options.baseline, row.group, grouped);
    throw new UserError(`--baseline-per-group has no entry for group "${row.group ?? "(none)"}" and no --baseline was given`);
  });
}

/** Formats a change with an explicit sign, e.g. "+86.3" / "-4.0" / "0.0". */
export function formatSigned(value: number, digits = 1): string {
  const text = value.toFixed(digits);
  // Avoid "-0.0" and "+0.0" for values that round to zero.
  if (Number(text) === 0) return (0).toFixed(digits);
  return value > 0 ? `+${text}` : text;
}

/** Percent change from `base` to `value`, e.g. "+4.9%". Empty when the baseline is zero. */
export function formatPercentChange(base: number, value: number): string {
  if (base === 0) return "";
  const pct = ((value - base) / Math.abs(base)) * 100;
  const text = pct.toFixed(1);
  if (Number(text) === 0) return "0.0%";
  return `${pct > 0 ? "+" : ""}${text}%`;
}
