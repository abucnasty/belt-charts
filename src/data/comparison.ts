/**
 * For the "vs Previous" / "vs Best" table columns: which row each row is compared with.
 * `totals` are the rows' times in table order (lower is better; a higher UPS is a lower time).
 * `groups` gives each row's `--group-by` group, or is omitted without groups.
 * - `previous[i]` is the row above `i` in the same group, or null for the first row of a group (or of the table).
 * - `best[i]` is the row with the lowest total in `i`'s group (the whole table without groups); the
 *   first one when several tie.
 */
export function comparisonRows(totals: number[], groups?: (string | undefined)[]): { previous: (number | null)[]; best: number[] } {
  const groupOf = (idx: number): string | undefined => groups?.[idx];
  const bestOfGroup = new Map<string | undefined, number>();
  totals.forEach((total, idx) => {
    const group = groupOf(idx);
    const best = bestOfGroup.get(group);
    if (best === undefined || total < totals[best]) bestOfGroup.set(group, idx);
  });
  return {
    previous: totals.map((_, idx) => (idx > 0 && groupOf(idx - 1) === groupOf(idx) ? idx - 1 : null)),
    best: totals.map((_, idx) => bestOfGroup.get(groupOf(idx))!),
  };
}
