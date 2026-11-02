import { describe, it, expect } from "vitest";
import { rowComparator } from "../charts/rowOrder";

type Row = { displayName: string; total: number };
const rows: Row[] = [
  { displayName: "10 inserters", total: 5 },
  { displayName: "3 inserters", total: 9 },
  { displayName: "b", total: 1 },
  { displayName: "A", total: 7 },
];
const sorted = (sort: "total" | "input" | "name") =>
  [...rows].sort(rowComparator<Row>(sort, (r) => r.total)).map((r) => r.displayName);

describe("rowComparator", () => {
  it("ranks by total ascending", () => {
    expect(sorted("total")).toEqual(["b", "10 inserters", "A", "3 inserters"]);
  });

  it("keeps the incoming order for input", () => {
    expect(sorted("input")).toEqual(["10 inserters", "3 inserters", "b", "A"]);
  });

  it("sorts by label, comparing numbers numerically and ignoring case", () => {
    expect(sorted("name")).toEqual(["3 inserters", "10 inserters", "A", "b"]);
  });
});
