import fs from "fs"
import csv from "csv-parser";
import { average, median, standardDeviation } from "../utils";

export interface RunResultRow {
    save_name: string;
    run_index: number;
    execution_time_ms: number;
    avg_ms: number;
    min_ms: number;
    max_ms: number;
    effective_ups: number;
    ticks: number;
    factorio_version: string;
    platform: string;
}

export type RunResultBySaveName = Map<string, RunResultRow[]>


export const parseRunResultsFile = async (filePath: string): Promise<RunResultBySaveName> => {
    const results: Map<string, RunResultRow[]> = new Map();

    await new Promise<void>((resolve, reject) => {
        fs.createReadStream(filePath)
            .pipe(csv())
            .on("data", (row: RunResultRow) => {
                const saveName = row.save_name
                const runResults = results.get(saveName) || []
                results.set(saveName, runResults.concat([{
                    save_name: saveName,
                    run_index: Number(row.run_index),
                    execution_time_ms: Number(row.execution_time_ms),
                    avg_ms: Number(row.avg_ms),
                    min_ms: Number(row.min_ms),
                    max_ms: Number(row.max_ms),
                    effective_ups: Number(row.effective_ups),
                    ticks: Number(row.ticks),
                    factorio_version: row.factorio_version,
                    platform: row.platform,
                }]))
            })
            .on("end", () => {
                resolve();
            })
            .on("error", reject)
    })

    return results;
}

export interface RunResultFilter {
    saveName: string;
    keep: RunResultRow[];
    remove: RunResultRow[];
}

export const filterRunResultsOutsideStdDeviations = (saveName: string, runResults: RunResultRow[], standardDeviations: number = 3): RunResultFilter => {
    const filters: RunResultFilter = {
        saveName,
        keep: [],
        remove: []
    }

    const std = standardDeviation(runResults.map(r => r.avg_ms));

    const avg = average(runResults.map(r => r.avg_ms));
    const max = avg + std * standardDeviations;
    
    runResults.forEach(row => {
        if(row.avg_ms > max) {
            filters.remove.push(row);
        } else {
            filters.keep.push(row);
        }
    });

    
    return filters;
}

export const filterResultsOutsideStdDeviations = (allResults: RunResultBySaveName, standardDeviations: number = 3): RunResultFilter[] => {
    const allFilters: RunResultFilter[] = [];
    allResults.forEach((rows, saveName) => {
        const filters = filterRunResultsOutsideStdDeviations(saveName, rows, standardDeviations);
        allFilters.push(filters);
    });
    return allFilters;
}