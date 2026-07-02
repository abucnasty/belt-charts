import { describe, it, expect } from "vitest";
import { toTitleCase } from "../commands/utils";

describe("toTitleCase", () => {
  it("converts snake_case to title case", () => {
    expect(toTitleCase("foo_bar_2")).toBe("Foo Bar 2");
  });

  it("converts kebab-case to title case", () => {
    expect(toTitleCase("foo-bar-2")).toBe("Foo Bar 2");
  });

  it("converts PascalCase to title case", () => {
    expect(toTitleCase("FooBar2")).toBe("Foo Bar 2");
  });

  it("converts camelCase to title case", () => {
    expect(toTitleCase("fooBar2")).toBe("Foo Bar 2");
  });

  it("converts SCREAMING_SNAKE_CASE to title case", () => {
    expect(toTitleCase("FOO_BAR_2")).toBe("Foo Bar 2");
  });

  it("all five conventions produce the same output", () => {
    const expected = "Foo Bar 2";
    expect(toTitleCase("foo_bar_2")).toBe(expected);  // snake_case
    expect(toTitleCase("foo-bar-2")).toBe(expected);  // kebab-case
    expect(toTitleCase("FooBar2")).toBe(expected);    // PascalCase
    expect(toTitleCase("fooBar2")).toBe(expected);    // camelCase
    expect(toTitleCase("FOO_BAR_2")).toBe(expected);  // SCREAMING_SNAKE
  });

  it("handles a numeric prefix segment", () => {
    expect(toTitleCase("60_electric_network_bench")).toBe("60 Electric Network Bench");
  });

  it("handles a single word", () => {
    expect(toTitleCase("foo")).toBe("Foo");
  });

  it("handles an already-title-cased single word", () => {
    expect(toTitleCase("Foo")).toBe("Foo");
  });

  it("returns an empty string unchanged", () => {
    expect(toTitleCase("")).toBe("");
  });

  it("handles multiple consecutive separators", () => {
    expect(toTitleCase("foo__bar")).toBe("Foo Bar");
  });
});
