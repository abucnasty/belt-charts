import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import zlib from "zlib";
import { once } from "events";
import { pipeline } from "stream/promises";
import { CsvCompression, compressionOf, readCsv, resultsFileBaseName } from "./csvReader";
import { MetricProfiles } from "../charts/metricProfiles";
import { MetricEnum } from "./MetricEnum";
import { MetricRegistryInstance } from "./MetricRegistry";

/** Columns every chart command needs to parse a file, kept even when they are zero everywhere. */
export const REQUIRED_COLUMNS = ["tick", "run", MetricEnum.WHOLE_UPDATE.name];

/**
 * Columns the chart commands read by default: tick, run, wholeUpdate, the summary categories,
 * entityUpdate and every entity type. `line`/`bar`/`table` can read others when asked to.
 */
export function chartedColumns(): Set<string> {
  return new Set<string>([
    ...REQUIRED_COLUMNS,
    ...MetricProfiles.SUMMARY_CHART.map(metric => metric.name),
    MetricEnum.ENTITY_UPDATE.name,
    ...MetricRegistryInstance.getChildrenOf(MetricEnum.ENTITY_UPDATE.name).map(metric => metric.name),
  ]);
}

export type ColumnScan = {
  /** Column names in order of first appearance across the files. */
  columns: string[];
  /** Columns that have a non-zero value in at least one file. */
  nonZero: Set<string>;
};

const isZero = (field: string): boolean => field === "" || Number(field) === 0;

/** Streams every file once and records which columns are ever non-zero. */
export async function scanColumns(files: string[], onFile?: (file: string) => void): Promise<ColumnScan> {
  const columns: string[] = [];
  const nonZero = new Set<string>();
  for (const file of files) {
    onFile?.(file);
    await readCsv(file, (header) => {
      for (const name of header) if (!columns.includes(name)) columns.push(name);
      const everNonZero = header.map(() => false);
      // Once every column of this file has shown a non-zero value there is nothing left to learn from it.
      let remaining = header.length;
      return (fields) => {
        if (remaining === 0) return;
        for (let i = 0; i < header.length; i++) {
          if (!everNonZero[i] && !isZero(fields[i] ?? "")) {
            everNonZero[i] = true;
            nonZero.add(header[i]);
            remaining--;
          }
        }
      };
    });
  }
  return { columns, nonZero };
}

export type PruneSelection = {
  keep: string[];
  droppedZero: string[];
  droppedNotCharted: string[];
};

/**
 * Chooses the columns to keep: the required ones always, then every column that is non-zero
 * somewhere (and, with `onlyCharted`, that a chart command reads). One list for the whole set, so
 * every file ends up with the same header.
 */
export function selectColumns(scan: ColumnScan, onlyCharted: boolean): PruneSelection {
  const charted = chartedColumns();
  const keep: string[] = [];
  const droppedZero: string[] = [];
  const droppedNotCharted: string[] = [];
  for (const name of scan.columns) {
    if (REQUIRED_COLUMNS.includes(name)) keep.push(name);
    else if (onlyCharted && !charted.has(name)) droppedNotCharted.push(name);
    else if (!scan.nonZero.has(name)) droppedZero.push(name);
    else keep.push(name);
  }
  return { keep, droppedZero, droppedNotCharted };
}

/** Quotes a field only when it needs it (comma, quote or line break). */
export function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Where a pruned file is written: `outDir` (or next to the input) with the compression's extension. */
export function prunedFileName(file: string, compression: CsvCompression): string {
  const base = path.basename(file);
  const stem = base.replace(/\.csv(\.gz|\.zst)?$/i, "");
  const ext = compression === "gz" ? ".csv.gz" : compression === "zst" ? ".csv.zst" : ".csv";
  // Keep the original spelling when the file did not end in .csv at all.
  return stem === base ? base + ext : stem + ext;
}

/**
 * Streams `file` into `destination`, keeping only the `keep` columns (in that order, so the header
 * is identical for every file; a column the file lacks is written as 0). Returns the bytes written.
 */
export async function writePrunedFile(file: string, destination: string, keep: string[], compression: CsvCompression): Promise<number> {
  const sink = fs.createWriteStream(destination);
  let output: NodeJS.WritableStream = sink;
  let finished: Promise<void> = once(sink, "close").then(() => undefined);
  if (compression !== "none") {
    if (compression === "zst" && typeof zlib.createZstdCompress !== "function") {
      throw new Error(`Writing .csv.zst needs Node.js 22.15 or newer (zstd support in zlib); this is ${process.version}`);
    }
    const compressor = compression === "gz" ? zlib.createGzip() : zlib.createZstdCompress();
    finished = pipeline(compressor, sink);
    output = compressor;
  }

  let buffer = "";
  const flush = async () => {
    if (buffer.length === 0) return;
    const chunk = buffer;
    buffer = "";
    if (!output.write(chunk)) await once(output, "drain");
  };

  try {
    await readCsv(file, (header) => {
      const indices = keep.map(name => header.lastIndexOf(name));
      buffer += keep.map(csvField).join(",") + "\n";
      return (fields) => {
        let line = "";
        for (let i = 0; i < indices.length; i++) {
          if (i > 0) line += ",";
          const index = indices[i];
          line += index === -1 ? "0" : csvField(fields[index] ?? "");
        }
        buffer += line + "\n";
      };
    }, { afterChunk: flush });
    await flush();
    output.end();
    await finished;
  } catch (error) {
    // Do not leave a half-written file behind.
    sink.destroy();
    await fsp.rm(destination, { force: true });
    throw error;
  }
  return (await fsp.stat(destination)).size;
}

export { resultsFileBaseName, compressionOf };
