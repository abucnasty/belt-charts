import { describe, it, expect } from "vitest";
import { applyLabel } from "../commands/utils";

const makeResult = (originalFileName: string, displayName?: string) => ({
  originalFileName,
  displayName: displayName ?? originalFileName,
  extra: 42,
});

describe("applyLabel", () => {
  it("returns the custom name when the originalFileName matches a key", () => {
    const customNames = new Map([["my-map", "My Custom Label"]]);
    const result = applyLabel(makeResult("my-map"), "my-", customNames);
    expect(result.displayName).toBe("My Custom Label");
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
    expect(result.displayName).toBe("Better Name");
  });

  it("falls back to trim-prefix when no custom name matches", () => {
    const customNames = new Map([["other-map", "Other"]]);
    const result = applyLabel(makeResult("prefix_map"), "prefix_", customNames);
    expect(result.displayName).toBe("map");
  });

  it("returns the original name when there is no match and no trim-prefix", () => {
    const result = applyLabel(makeResult("my-map"), "", new Map());
    expect(result.displayName).toBe("my-map");
  });

  it("empty customNames map is a no-op (falls through to trim-prefix)", () => {
    const result = applyLabel(makeResult("pre_map"), "pre_", new Map());
    expect(result.displayName).toBe("map");
  });

  it("labels may contain = characters", () => {
    const customNames = new Map([["map", "A=B"]]);
    const result = applyLabel(makeResult("map"), "", customNames);
    expect(result.displayName).toBe("A=B");
  });

  it("does not trim prefix when displayName does not start with the prefix", () => {
    const result = applyLabel(makeResult("other_map"), "prefix_", new Map());
    expect(result.displayName).toBe("other_map");
  });

  it("applies title case to the displayName when titleCase is true", () => {
    const result = applyLabel(makeResult("my_map"), "", new Map(), true);
    expect(result.displayName).toBe("My Map");
  });

  it("does not apply title case when titleCase is false", () => {
    const result = applyLabel(makeResult("my_map"), "", new Map(), false);
    expect(result.displayName).toBe("my_map");
  });

  it("applies title case after trim-prefix", () => {
    const result = applyLabel(makeResult("prefix_my_map"), "prefix_", new Map(), true);
    expect(result.displayName).toBe("My Map");
  });

  it("does not apply title case when a custom name matches", () => {
    const customNames = new Map([["my_map", "My Custom Label"]]);
    const result = applyLabel(makeResult("my_map"), "", customNames, true);
    expect(result.displayName).toBe("My Custom Label");
  });

  it("preserves originalFileName unchanged across all transforms", () => {
    const customNames = new Map([["also-a-key", "Custom"]]);
    const cases = [
      applyLabel(makeResult("prefix_my_map"), "prefix_", new Map(), true),
      applyLabel(makeResult("prefix_my_map"), "prefix_", new Map(), false, ["my_"]),
      applyLabel(makeResult("also-a-key"), "", customNames),
      applyLabel(makeResult("plain"), "", new Map()),
    ];
    expect(cases[0].originalFileName).toBe("prefix_my_map");
    expect(cases[1].originalFileName).toBe("prefix_my_map");
    expect(cases[2].originalFileName).toBe("also-a-key");
    expect(cases[3].originalFileName).toBe("plain");
  });
});
