import { minimatch } from "minimatch";
import { average, max, median, min, standardDeviation } from "../utils";
import { readCsvRows } from "./csvReader";
import { AggregationStrategy } from "./AggregationStrategy";

export type CpuFrequencyRowRaw = {
    save_name: string;
    run_index: string;
    core_index: string;
    cpu_frequency: string;
    timestamp: string;
}

export interface CoreFrequencyStat {
    coreIndex: number;
    average: number; // MHz
    median: number; // MHz
    minimum: number; // MHz
    maximum: number; // MHz
    standardDeviation: number;
}

export interface RunCoreFrequencyProfile {
    run: number;
    cores: CoreFrequencyStat[];
}

export interface CpuFrequencyResult {
    /** Immutable identity for this design, taken from the CSV's `save_name` column (a single cpu_freq.csv can bundle multiple save_names). */
    originalFileName: string;
    /** Transformed label shown in charts. Modified by the label pipeline. */
    displayName: string;
    /** Optional group key set by the command layer for chart clustering. */
    group?: string;
    runs: RunCoreFrequencyProfile[];
}

/** Picks the value to display/color for a core according to the chosen aggregate strategy. */
export function getCoreFrequencyStatValue(stat: CoreFrequencyStat, strategy: AggregationStrategy): number {
    switch (strategy) {
        case AggregationStrategy.AVERAGE: return stat.average;
        case AggregationStrategy.MINIMUM: return stat.minimum;
        case AggregationStrategy.MAXIMUM: return stat.maximum;
        case AggregationStrategy.MEDIAN: return stat.median;
        case AggregationStrategy.STANDARD_DEVIATION: return stat.standardDeviation;
    }
}

/**
 * Returns true if `saveName` matches any of the given glob patterns, or if `patterns`
 * is empty (no filter = match everything). Uses shell-glob semantics (`*`, `?`, `[...]`, etc.)
 * via minimatch, matched against the raw save_name string rather than a file path.
 */
export function matchesSaveNameFilter(saveName: string, patterns: string[]): boolean {
    if (patterns.length === 0) return true;
    return patterns.some(pattern => minimatch(saveName, pattern));
}

/**
 * Parses a cpu_freq.csv file into one `CpuFrequencyResult` per distinct `save_name`
 * found in the file, since a single file can bundle multiple benchmark designs.
 * `runsToRemove` is keyed by save_name, matching the convention used by `loadRunFilters`.
 * `saveNameFilters` restricts which save_names are included via glob pattern (empty = all).
 */
export const parseCpuFrequencyResultsFromCsv = async (
    filePath: string,
    runsToRemove: Map<string, Set<number>>,
    saveNameFilters: string[] = [],
): Promise<CpuFrequencyResult[]> => {
    // save_name -> run -> core -> frequency samples across all timestamps
    const samplesBySaveNameRunAndCore: Map<string, Map<number, Map<number, number[]>>> = new Map();

    await readCsvRows<CpuFrequencyRowRaw>(filePath, (row) => {
        const saveName = row.save_name;
        if (!matchesSaveNameFilter(saveName, saveNameFilters)) return;

        const run = Number(row.run_index);
        if (runsToRemove.get(saveName)?.has(run)) return;

        const coreIndex = Number(row.core_index);
        const frequency = Number(row.cpu_frequency);

        if (!samplesBySaveNameRunAndCore.has(saveName)) {
            samplesBySaveNameRunAndCore.set(saveName, new Map());
        }
        const runsForSaveName = samplesBySaveNameRunAndCore.get(saveName)!;
        if (!runsForSaveName.has(run)) {
            runsForSaveName.set(run, new Map());
        }
        const coresForRun = runsForSaveName.get(run)!;
        if (!coresForRun.has(coreIndex)) {
            coresForRun.set(coreIndex, []);
        }
        coresForRun.get(coreIndex)!.push(frequency);
    });

    return [...samplesBySaveNameRunAndCore.entries()].map(([saveName, runsForSaveName]) => {
        const runs: RunCoreFrequencyProfile[] = [...runsForSaveName.entries()]
            .sort(([a], [b]) => a - b)
            .map(([run, coresForRun]) => ({
                run,
                cores: [...coresForRun.entries()]
                    .sort(([a], [b]) => a - b)
                    .map(([coreIndex, samples]) => ({
                        coreIndex,
                        average: average(samples),
                        median: median(samples),
                        minimum: min(samples),
                        maximum: max(samples),
                        standardDeviation: standardDeviation(samples),
                    })),
            }));

        return {
            originalFileName: saveName,
            displayName: saveName,
            runs,
        };
    });
}
