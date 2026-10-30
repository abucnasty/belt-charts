import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readCsv, readCsvRows } from "../data/csvReader";

let dir: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "belt-charts-csv-"));
});

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const writeCsv = (name: string, content: string): string => {
  const file = path.join(dir, name);
  fs.writeFileSync(file, content);
  return file;
};

const readAll = async (file: string) => {
  let header: string[] = [];
  const records: string[][] = [];
  await readCsv(file, (columns) => {
    header = columns;
    return (fields) => records.push(fields);
  });
  return { header, records };
};

describe("readCsv", () => {
  it("reads the header and each row's fields", async () => {
    const file = writeCsv("basic.csv", "tick,run,wholeUpdate\n1,1,100\n2,1,200\n");
    expect(await readAll(file)).toEqual({
      header: ["tick", "run", "wholeUpdate"],
      records: [["1", "1", "100"], ["2", "1", "200"]],
    });
  });

  it("handles CRLF line endings, a UTF-8 BOM, blank lines and no trailing newline", async () => {
    const file = writeCsv("windows.csv", "﻿tick,run\r\n1,2\r\n\r\n3,4");
    expect(await readAll(file)).toEqual({ header: ["tick", "run"], records: [["1", "2"], ["3", "4"]] });
  });

  it("parses quoted fields with commas, escaped quotes and embedded newlines", async () => {
    const file = writeCsv("quoted.csv", 'name,value\r\n"a,b",1\r\n"say ""hi""",2\r\n"multi\nline",3\r\n');
    expect((await readAll(file)).records).toEqual([
      ["a,b", "1"],
      ['say "hi"', "2"],
      ["multi\nline", "3"],
    ]);
  });

  it("reassembles rows that span stream chunk boundaries", async () => {
    const rows = Array.from({ length: 60000 }, (_, i) => `${i},${i % 7},${"é".repeat(i % 5)}${i * 13}`);
    const file = writeCsv("large.csv", ["tick,run,value", ...rows].join("\n") + "\n");
    expect(fs.statSync(file).size).toBeGreaterThan(1 << 20);
    const { records } = await readAll(file);
    expect(records.map((r) => r.join(","))).toEqual(rows);
  });

  it("returns no records for a header-only file", async () => {
    const file = writeCsv("header-only.csv", "tick,run\n");
    expect(await readAll(file)).toEqual({ header: ["tick", "run"], records: [] });
  });

  it("rejects an unterminated quoted field", async () => {
    const file = writeCsv("unterminated.csv", 'name\n"open\n');
    await expect(readAll(file)).rejects.toThrow("Unterminated quoted field");
  });

  it("rejects a missing file", async () => {
    await expect(readAll(path.join(dir, "missing.csv"))).rejects.toThrow();
  });
});

describe("readCsvRows", () => {
  it("keys each row by column name, leaving missing trailing fields undefined", async () => {
    const file = writeCsv("rows.csv", "save_name,run_index,platform\nmap_a,1,linux\nmap_b,2\n");
    const rows: Record<string, string>[] = [];
    await readCsvRows<Record<string, string>>(file, (row) => rows.push(row));
    expect(rows).toEqual([
      { save_name: "map_a", run_index: "1", platform: "linux" },
      { save_name: "map_b", run_index: "2" },
    ]);
  });
});
