import fs from "fs";

/** Called once per data row with that row's raw field values, in header order. */
export type CsvRecordHandler = (fields: string[]) => void;

/**
 * Streams a CSV file. `onHeader` receives the header's column names once and returns the
 * handler for every following data row, so callers can resolve column indices up front.
 *
 * Verbose-metrics files run to hundreds of MB with 100+ numeric columns. Splitting lines into
 * plain string arrays is several times faster than building a keyed object per row (as
 * csv-parser does). Quoted fields (including embedded commas, `""` escapes and newlines) are
 * still supported via a slower path, taken only for lines that contain a quote.
 *
 * Also handles CRLF line endings, strips a leading UTF-8 BOM (written by e.g. PowerShell), and
 * skips blank lines.
 */
export async function readCsv(
    filePath: string,
    onHeader: (columns: string[]) => CsvRecordHandler,
): Promise<void> {
    let onRecord: CsvRecordHandler | null = null;
    let partialLine = "";
    let pendingQuotedLine: string | null = null;

    const handleLine = (rawLine: string): void => {
        let line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
        if (pendingQuotedLine !== null) {
            line = `${pendingQuotedLine}\n${line}`;
            pendingQuotedLine = null;
        }
        let fields: string[];
        if (!line.includes('"')) {
            if (line.length === 0) return;
            fields = line.split(",");
        } else {
            const parsed = splitQuotedLine(line);
            if (parsed === null) {
                // Unterminated quote: the field continues on the next line.
                pendingQuotedLine = line;
                return;
            }
            fields = parsed;
        }
        if (onRecord === null) {
            onRecord = onHeader(fields);
        } else {
            onRecord(fields);
        }
    };

    const stream = fs.createReadStream(filePath, { encoding: "utf8", highWaterMark: 1 << 20 });
    let first = true;
    for await (const chunk of stream as AsyncIterable<string>) {
        let text = partialLine + chunk;
        if (first) {
            if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
            first = false;
        }
        const lines = text.split("\n");
        partialLine = lines.pop()!;
        for (const line of lines) handleLine(line);
    }
    if (partialLine.length > 0) handleLine(partialLine);
    if (pendingQuotedLine !== null) {
        throw new Error(`Unterminated quoted field in CSV file ${filePath}`);
    }
}

/** Splits a line containing quoted fields. Returns null if a quoted field is left unterminated. */
function splitQuotedLine(line: string): string[] | null {
    const fields: string[] = [];
    let field = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
            if (ch === '"') {
                if (line[i + 1] === '"') {
                    field += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                field += ch;
            }
        } else if (ch === '"') {
            inQuotes = true;
        } else if (ch === ",") {
            fields.push(field);
            field = "";
        } else {
            field += ch;
        }
    }
    if (inQuotes) return null;
    fields.push(field);
    return fields;
}

/**
 * Convenience wrapper over `readCsv` that hands each row to `onRow` as an object keyed by
 * column name. Simpler for small files; prefer `readCsv` with column indices for large ones.
 */
export async function readCsvRows<T extends object>(
    filePath: string,
    onRow: (row: T) => void,
): Promise<void> {
    await readCsv(filePath, (columns) => (fields) => {
        const row: Record<string, string> = {};
        for (let i = 0; i < columns.length; i++) {
            if (fields[i] !== undefined) row[columns[i]] = fields[i];
        }
        onRow(row as T);
    });
}
