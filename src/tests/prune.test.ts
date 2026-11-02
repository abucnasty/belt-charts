import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { readCsv, compressionOf, resultsFileBaseName } from "../data/csvReader";
import { chartedColumns, csvField, prunedFileName, scanColumns, selectColumns, writePrunedFile } from "../data/prune";
import { MetricEnum } from "../data/MetricEnum";

let dir: string;
beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "belt-charts-prune-"));
});
afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const write = (name: string, content: string | Buffer): string => {
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

const csv = "tick,run,wholeUpdate,Inserter,Zero\n1,1,100,10,0\n2,1,200,20,0\n";

describe("compressed results files", () => {
  it("reads .csv.gz like .csv", async () => {
    const plain = await readAll(write("a.csv", csv));
    const gz = await readAll(write("a.csv.gz", zlib.gzipSync(csv)));
    expect(gz).toEqual(plain);
  });

  it.runIf(typeof zlib.createZstdDecompress === "function")("reads .csv.zst like .csv", async () => {
    const plain = await readAll(write("b.csv", csv));
    const zst = await readAll(write("b.csv.zst", zlib.zstdCompressSync(csv)));
    expect(zst).toEqual(plain);
  });

  it("reads a gzip file that is larger than one read chunk", async () => {
    const rows = Array.from({ length: 200_000 }, (_, i) => `${i},1,${i},${i * 2},0`).join("\n");
    const file = write("big.csv.gz", zlib.gzipSync(`tick,run,wholeUpdate,Inserter,Zero\n${rows}\n`));
    const { records } = await readAll(file);
    expect(records.length).toBe(200_000);
    expect(records[199_999]).toEqual(["199999", "1", "199999", "399998", "0"]);
  });

  it("reports a corrupt gzip file as an error", async () => {
    const file = write("bad.csv.gz", Buffer.from("not gzip data"));
    await expect(readAll(file)).rejects.toThrow();
  });

  it("detects compression and the base name from the extension", () => {
    expect(compressionOf("x.csv.gz")).toBe("gz");
    expect(compressionOf("x.csv.zst")).toBe("zst");
    expect(compressionOf("x.csv")).toBe("none");
    expect(resultsFileBaseName("dir/4i-as-saved_verbose_metrics.csv")).toBe("4i-as-saved");
    expect(resultsFileBaseName("dir/4i-as-saved_verbose_metrics.csv.gz")).toBe("4i-as-saved");
    expect(resultsFileBaseName("dir/4i-as-saved_verbose_metrics.csv.zst")).toBe("4i-as-saved");
    expect(resultsFileBaseName("dir/plain.csv")).toBe("plain");
  });
});

describe("column selection", () => {
  it("drops a column only when it is zero in every file", async () => {
    const a = write("sel_a.csv", "tick,run,wholeUpdate,Inserter,Furnace,Never\n1,1,100,0,0,0\n");
    const b = write("sel_b.csv", "tick,run,wholeUpdate,Inserter,Furnace,Never\n1,1,100,5,0,0.0\n");
    const scan = await scanColumns([a, b]);
    expect(scan.columns).toEqual(["tick", "run", "wholeUpdate", "Inserter", "Furnace", "Never"]);
    const selection = selectColumns(scan, false);
    expect(selection.keep).toEqual(["tick", "run", "wholeUpdate", "Inserter"]);
    expect(selection.droppedZero).toEqual(["Furnace", "Never"]);
  });

  it("always keeps the columns every chart needs, even when they are zero", async () => {
    const a = write("sel_c.csv", "tick,run,wholeUpdate,Inserter\n0,0,0,0\n");
    const { keep } = selectColumns(await scanColumns([a]), false);
    expect(keep).toEqual(["tick", "run", "wholeUpdate"]);
  });

  it("with onlyCharted also drops non-zero columns that no chart reads", async () => {
    const a = write("sel_d.csv", "tick,run,wholeUpdate,entityUpdate,Inserter,customDebugColumn\n1,1,1,1,1,9\n");
    const selection = selectColumns(await scanColumns([a]), true);
    expect(selection.keep).toEqual(["tick", "run", "wholeUpdate", "entityUpdate", "Inserter"]);
    expect(selection.droppedNotCharted).toEqual(["customDebugColumn"]);
    expect(selectColumns(await scanColumns([a]), false).keep).toContain("customDebugColumn");
  });

  it("charts the summary categories, entityUpdate and every entity type", () => {
    const charted = chartedColumns();
    for (const name of ["tick", "run", "wholeUpdate", "entityUpdate", "controlBehaviorUpdate", "Inserter", "AssemblingMachine"]) {
      expect(charted.has(name)).toBe(true);
    }
    expect(charted.has(MetricEnum.OTHER.name)).toBe(true);
  });
});

describe("writePrunedFile", () => {
  it("writes the kept columns in the given order, the same header for every file", async () => {
    const a = write("w_a.csv", "tick,run,wholeUpdate,Inserter,Zero\n1,1,100,10,0\n2,1,200,20,0\n");
    const b = write("w_b.csv", "run,tick,Zero,wholeUpdate,Inserter\n1,1,0,300,30\n");
    const keep = ["tick", "run", "wholeUpdate", "Inserter"];
    await writePrunedFile(a, path.join(dir, "w_a_out.csv"), keep, "none");
    await writePrunedFile(b, path.join(dir, "w_b_out.csv"), keep, "none");
    expect(fs.readFileSync(path.join(dir, "w_a_out.csv"), "utf8")).toBe("tick,run,wholeUpdate,Inserter\n1,1,100,10\n2,1,200,20\n");
    expect(fs.readFileSync(path.join(dir, "w_b_out.csv"), "utf8")).toBe("tick,run,wholeUpdate,Inserter\n1,1,300,30\n");
  });

  it("writes 0 for a kept column the file lacks, and quotes fields that need it", async () => {
    const a = write("w_c.csv", 'tick,run,wholeUpdate,note\n1,1,100,"a, b"\n');
    await writePrunedFile(a, path.join(dir, "w_c_out.csv"), ["tick", "run", "wholeUpdate", "note", "Inserter"], "none");
    expect(fs.readFileSync(path.join(dir, "w_c_out.csv"), "utf8")).toBe('tick,run,wholeUpdate,note,Inserter\n1,1,100,"a, b",0\n');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
  });

  it("round-trips through gzip and keeps every row of a large file", async () => {
    const rows = Array.from({ length: 100_000 }, (_, i) => `${i},1,${i},${i % 7},0`).join("\n");
    const input = write("w_big.csv", `tick,run,wholeUpdate,Inserter,Zero\n${rows}\n`);
    const out = path.join(dir, "w_big_out.csv.gz");
    const size = await writePrunedFile(input, out, ["tick", "run", "wholeUpdate", "Inserter"], "gz");
    expect(size).toBe(fs.statSync(out).size);
    const { header, records } = await readAll(out);
    expect(header).toEqual(["tick", "run", "wholeUpdate", "Inserter"]);
    expect(records.length).toBe(100_000);
    expect(records[99_999]).toEqual(["99999", "1", "99999", String(99_999 % 7)]);
  });

  it.runIf(typeof zlib.createZstdCompress === "function")("writes zstd that reads back", async () => {
    const input = write("w_z.csv", csv);
    const out = path.join(dir, "w_z_out.csv.zst");
    await writePrunedFile(input, out, ["tick", "run", "wholeUpdate"], "zst");
    expect((await readAll(out)).records).toEqual([["1", "1", "100"], ["2", "1", "200"]]);
  });

  it("removes a partial output when the input is unreadable", async () => {
    const out = path.join(dir, "w_fail_out.csv");
    await expect(writePrunedFile(path.join(dir, "missing.csv"), out, ["tick"], "none")).rejects.toThrow();
    expect(fs.existsSync(out)).toBe(false);
  });

  it("names pruned files with the compression's extension", () => {
    expect(prunedFileName("a/x_verbose_metrics.csv", "gz")).toBe("x_verbose_metrics.csv.gz");
    expect(prunedFileName("a/x.csv.zst", "none")).toBe("x.csv");
    expect(prunedFileName("a/x.csv.gz", "gz")).toBe("x.csv.gz");
  });
});
