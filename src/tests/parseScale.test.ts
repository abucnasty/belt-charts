import { describe, it, expect, vi, afterEach } from "vitest";
import { parseScale } from "../commands/utils";

describe("parseScale", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("accepts positive integers", () => {
    expect(parseScale("1")).toBe(1);
    expect(parseScale("2")).toBe(2);
    expect(parseScale("4")).toBe(4);
  });

  it.each(["0", "-1", "1.5", "abc", ""])("exits on invalid value %j", (value) => {
    const exit = vi.spyOn(process, "exit").mockImplementation((() => { throw new Error("exit"); }) as any);
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => parseScale(value)).toThrow("exit");
    expect(exit).toHaveBeenCalledWith(1);
  });
});
