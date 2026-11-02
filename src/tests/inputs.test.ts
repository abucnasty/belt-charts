import { describe, it, expect } from "vitest";
import { filterInputs, orderInputs, parseInputSpec, type ChartInput } from "../commands/inputs";
import { applyLabel } from "../commands/utils";

describe("parseInputSpec", () => {
  it("returns a bare glob unchanged", () => {
    expect(parseInputSpec("results/*.csv")).toEqual({ glob: "results/*.csv" });
  });

  it("splits a label suffix off after the last colon", () => {
    expect(parseInputSpec("results_plain/*.csv:malloc")).toEqual({ glob: "results_plain/*.csv", suffix: "malloc" });
  });

  it("keeps spaces and punctuation in the suffix", () => {
    expect(parseInputSpec("a/*.csv:game 2.0, mimalloc")).toEqual({ glob: "a/*.csv", suffix: "game 2.0, mimalloc" });
  });

  it("does not mistake a Windows drive letter for a suffix", () => {
    expect(parseInputSpec("C:\\data\\*.csv")).toEqual({ glob: "C:\\data\\*.csv" });
    expect(parseInputSpec("C:/data/*.csv")).toEqual({ glob: "C:/data/*.csv" });
  });

  it("still takes a suffix after a Windows path", () => {
    expect(parseInputSpec("C:\\data\\*.csv:win")).toEqual({ glob: "C:\\data\\*.csv", suffix: "win" });
  });

  it("treats a trailing colon as part of the glob", () => {
    expect(parseInputSpec("a/*.csv:")).toEqual({ glob: "a/*.csv:" });
  });
});

const input = (file: string, suffix?: string): ChartInput => ({ file, suffix });
const baseOf = (i: ChartInput) => i.file.replace(/^.*\//, "").replace(".csv", "");
const candidates = (i: ChartInput) => (i.suffix ? [baseOf(i), `${baseOf(i)} (${i.suffix})`] : [baseOf(i)]);

describe("filterInputs", () => {
  const inputs = [input("a/one.csv", "x"), input("a/two.csv", "x"), input("b/one.csv", "y"), input("b/three.csv", "y")];

  it("keeps everything without patterns", () => {
    expect(filterInputs(inputs, { include: [], exclude: [] }, candidates).kept).toEqual(inputs);
  });

  it("keeps only inputs matching an include glob", () => {
    const { kept } = filterInputs(inputs, { include: ["one", "thr*"], exclude: [] }, candidates);
    expect(kept.map((i) => i.file)).toEqual(["a/one.csv", "b/one.csv", "b/three.csv"]);
  });

  it("drops inputs matching an exclude glob, after include", () => {
    const { kept } = filterInputs(inputs, { include: ["*o*"], exclude: ["two"] }, candidates);
    expect(kept.map((i) => i.file)).toEqual(["a/one.csv", "b/one.csv"]);
  });

  it("matches the label with its suffix, to tell sessions apart", () => {
    const { kept } = filterInputs(inputs, { include: [], exclude: ["*(y)"] }, candidates);
    expect(kept.map((i) => i.file)).toEqual(["a/one.csv", "a/two.csv"]);
  });

  it("reports patterns that matched nothing", () => {
    const result = filterInputs(inputs, { include: ["one", "nope"], exclude: ["zzz"] }, candidates);
    expect(result.unmatchedIncludes).toEqual(["nope"]);
    expect(result.unmatchedExcludes).toEqual(["zzz"]);
  });
});

describe("orderInputs", () => {
  const inputs = [input("a/two.csv", "x"), input("a/one.csv", "x"), input("b/two.csv", "y"), input("b/one.csv", "y")];
  const order = (patterns: string[], names: string[]) =>
    orderInputs(inputs, baseOf, patterns, candidates, names).map((i) => `${i.suffix}/${baseOf(i)}`);

  it("keeps first-appearance order and groups sessions of the same save", () => {
    expect(order([], [])).toEqual(["x/two", "y/two", "x/one", "y/one"]);
  });

  it("follows the names-file order first", () => {
    expect(order([], ["one", "two"])).toEqual(["x/one", "y/one", "x/two", "y/two"]);
  });

  it("follows --include pattern order before the names file", () => {
    expect(order(["one", "two"], ["two", "one"])).toEqual(["x/one", "y/one", "x/two", "y/two"]);
  });
});

describe("applyLabel with an input suffix", () => {
  const base = { originalFileName: "4i-as-saved", displayName: "4i-as-saved", inputSuffix: "mimalloc" };

  it("appends the suffix to the plain base name", () => {
    expect(applyLabel(base, "", new Map()).displayName).toBe("4i-as-saved (mimalloc)");
  });

  it("appends the suffix after a names-file label", () => {
    const names = new Map([["4i-as-saved", "4 Inserters, As Saved"]]);
    expect(applyLabel(base, "", names).displayName).toBe("4 Inserters, As Saved (mimalloc)");
  });

  it("appends the suffix after trim and title case", () => {
    expect(applyLabel(base, "4i-", new Map(), true).displayName).toBe("As Saved (mimalloc)");
  });

  it("leaves results without a suffix alone", () => {
    const plain = { originalFileName: "a", displayName: "a" };
    expect(applyLabel(plain, "", new Map()).displayName).toBe("a");
  });
});
