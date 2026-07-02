import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import { parseNamesFile, mergeCustomNames } from "../commands/utils";

vi.mock("node:fs");

const mockReadFileSync = vi.mocked(fs.readFileSync);

describe("parseNamesFile", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("parses simple key=label entries", () => {
    mockReadFileSync.mockReturnValue("map_a=Design A\nmap_b=Design B\n");
    const result = parseNamesFile("names.txt");
    expect(result.get("map_a")).toBe("Design A");
    expect(result.get("map_b")).toBe("Design B");
  });

  it("ignores lines starting with #", () => {
    mockReadFileSync.mockReturnValue("# This is a comment\nmap_a=Design A\n");
    const result = parseNamesFile("names.txt");
    expect(result.size).toBe(1);
    expect(result.get("map_a")).toBe("Design A");
  });

  it("ignores blank lines", () => {
    mockReadFileSync.mockReturnValue("\nmap_a=Design A\n\n");
    const result = parseNamesFile("names.txt");
    expect(result.size).toBe(1);
  });

  it("splits on the first = only — labels may contain =", () => {
    mockReadFileSync.mockReturnValue("map_a=Label=With=Equals\n");
    const result = parseNamesFile("names.txt");
    expect(result.get("map_a")).toBe("Label=With=Equals");
  });

  it("warns and skips malformed lines with no =", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockReadFileSync.mockReturnValue("not_valid\nmap_a=Design A\n");
    const result = parseNamesFile("names.txt");
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toContain("not_valid");
    expect(result.size).toBe(1);
    expect(result.get("map_a")).toBe("Design A");
  });

  it("returns an empty map for an empty file", () => {
    mockReadFileSync.mockReturnValue("");
    expect(parseNamesFile("names.txt").size).toBe(0);
  });

  it("handles Windows CRLF line endings", () => {
    mockReadFileSync.mockReturnValue("map_a=Design A\r\nmap_b=Design B\r\n");
    const result = parseNamesFile("names.txt");
    expect(result.get("map_a")).toBe("Design A");
    expect(result.get("map_b")).toBe("Design B");
  });

  it("trims leading/trailing whitespace from lines", () => {
    mockReadFileSync.mockReturnValue("  map_a=Design A  \n");
    const result = parseNamesFile("names.txt");
    // The whole line is trimmed, so trailing spaces on the label are also stripped
    expect(result.get("map_a")).toBe("Design A");
  });
});

describe("mergeCustomNames", () => {
  it("flag entries override file entries on duplicate keys", () => {
    const fileMap = new Map([["map_a", "From File"], ["map_b", "B from file"]]);
    const flagMap = new Map([["map_a", "From Flag"]]);
    const result = mergeCustomNames(fileMap, flagMap);
    expect(result.get("map_a")).toBe("From Flag");
    expect(result.get("map_b")).toBe("B from file");
  });

  it("file entries are included when not overridden by flags", () => {
    const fileMap = new Map([["map_a", "From File"]]);
    const flagMap = new Map<string, string>();
    expect(mergeCustomNames(fileMap, flagMap).get("map_a")).toBe("From File");
  });

  it("flag entries are included when no file is provided", () => {
    const fileMap = new Map<string, string>();
    const flagMap = new Map([["map_a", "From Flag"]]);
    expect(mergeCustomNames(fileMap, flagMap).get("map_a")).toBe("From Flag");
  });

  it("returns an empty map when both inputs are empty", () => {
    expect(mergeCustomNames(new Map(), new Map()).size).toBe(0);
  });
});
