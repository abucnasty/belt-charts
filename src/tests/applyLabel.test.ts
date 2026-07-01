import { describe, it, expect, vi } from "vitest";
import { applyLabel } from "../commands/utils";

const makeResult = (fileName: string) => ({ fileName, extra: 42 });

describe("applyLabel", () => {
  it("returns the custom name when the fileName matches a key", () => {
    const customNames = new Map([["my-map", "My Custom Label"]]);
    const result = applyLabel(makeResult("my-map"), "my-", customNames);
    expect(result.fileName).toBe("My Custom Label");
  });

  it("preserves other properties when applying a custom name", () => {
    const customNames = new Map([["my-map", "Label"]]);
    const result = applyLabel(makeResult("my-map"), "", customNames);
    expect(result.extra).toBe(42);
  });

  it("skips trim-prefix when a custom name matches", () => {
    const customNames = new Map([["prefix_map", "Better Name"]]);
    const result = applyLabel(makeResult("prefix_map"), "prefix_", customNames);
    // custom name wins — trim-prefix should NOT be applied on top
    expect(result.fileName).toBe("Better Name");
  });

  it("falls back to trim-prefix when no custom name matches", () => {
    const customNames = new Map([["other-map", "Other"]]);
    const result = applyLabel(makeResult("prefix_map"), "prefix_", customNames);
    expect(result.fileName).toBe("map");
  });

  it("returns the original fileName when there is no match and no trim-prefix", () => {
    const result = applyLabel(makeResult("my-map"), "", new Map());
    expect(result.fileName).toBe("my-map");
  });

  it("empty customNames map is a no-op (falls through to trim-prefix)", () => {
    const result = applyLabel(makeResult("pre_map"), "pre_", new Map());
    expect(result.fileName).toBe("map");
  });

  it("labels may contain = characters", () => {
    const customNames = new Map([["map", "A=B"]]);
    const result = applyLabel(makeResult("map"), "", customNames);
    expect(result.fileName).toBe("A=B");
  });

  it("does not trim prefix when fileName does not start with the prefix", () => {
    const result = applyLabel(makeResult("other_map"), "prefix_", new Map());
    expect(result.fileName).toBe("other_map");
  });
});
