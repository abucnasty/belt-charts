import fs from "fs";
import csv from "csv-parser";

/**
 * Streams every row from a CSV file, calling `onRow` for each one.
 * Rejects if the stream emits an error.
 */
export async function readCsvRows<T extends object>(
    filePath: string,
    onRow: (row: T) => void,
): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        fs.createReadStream(filePath)
            .pipe(csv())
            .on("data", (row: T) => onRow(row))
            .on("end", () => resolve())
            .on("error", reject);
    });
}
