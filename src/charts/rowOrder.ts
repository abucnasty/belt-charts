import type { RowSort } from "../commands/types";

const nameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/**
 * Comparator for the `--sort` row order. `total` ranks by the given total (ascending), `name` by
 * label (numbers inside names compare as numbers, so "3 inserters" sorts before "10 inserters"),
 * and `input` keeps the incoming order: Array.prototype.sort is stable, so returning 0 leaves the
 * order the inputs were resolved in (which already follows `--include`, the names file and the inputs).
 */
export function rowComparator<T extends { displayName: string }>(
  sort: RowSort,
  total: (row: T) => number,
): (a: T, b: T) => number {
  switch (sort) {
    case "total":
      return (a, b) => total(a) - total(b);
    case "name":
      return (a, b) => nameCollator.compare(a.displayName, b.displayName);
    case "input":
      return () => 0;
  }
}
