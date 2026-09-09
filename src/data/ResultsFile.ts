import fs from "fs"
import csv from "csv-parser";
import { median, medianAbsoluteDeviation } from "../utils";

// Scales MAD to be comparable to a standard deviation under a normal distribution, so
// `standardDeviations` keeps its usual meaning even though the estimate is now robust.
// https://en.wikipedia.org/wiki/Median_absolute_deviation#Relation_to_standard_deviation
const MAD_TO_STD_SCALE = 1.4826;

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

    const values = runResults.map(r => r.avg_ms);
    const med = median(values);
    // Median/MAD instead of mean/std: a few slow runs can inflate the mean/std enough to hide
    // themselves (masking effect), but they barely move the median or MAD. See sources above.
    const robustStd = medianAbsoluteDeviation(values) * MAD_TO_STD_SCALE;

    const max = med + robustStd * standardDeviations;
    const min = med - robustStd * standardDeviations;

    runResults.forEach(row => {
        if(row.avg_ms > max || row.avg_ms < min) {
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