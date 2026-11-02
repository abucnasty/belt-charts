import { UserError } from "../utils";

/** The parsed `--group-by` value: the keys, in order, and the heading shown for the keys that have one. */
export type GroupBySpec = {
  keys: string[];
  /** Heading per key from `key=Label` entries. A key without an entry is shown as itself. */
  labels: Map<string, string>;
};

/**
 * Parses `--group-by` entries: `key` or `key=Label` (split on the first `=`, so a label may contain
 * `=`). The key is what is matched against the file base name; the label, when given, replaces it
 * in the chart's group headings and the table's Group column. Labels cannot contain commas.
 */
export function parseGroupBy(entries: string[]): GroupBySpec {
  const keys: string[] = [];
  const labels = new Map<string, string>();
  for (const entry of entries) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) {
      keys.push(trimmed);
      continue;
    }
    const key = trimmed.slice(0, idx).trim();
    const label = trimmed.slice(idx + 1).trim();
    if (!key || !label) {
      throw new UserError(`--group-by: invalid entry "${trimmed}", expected "<key>" or "<key>=<label>"`);
    }
    keys.push(key);
    labels.set(key, label);
  }
  return { keys, labels };
}

/** The heading to show for a group key. */
export function groupLabel(labels: Map<string, string> | undefined, key: string): string {
  return labels?.get(key) ?? key;
}
