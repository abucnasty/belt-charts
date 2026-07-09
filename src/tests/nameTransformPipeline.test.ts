import { describe, it, expect } from "vitest";
import { applyLabel } from "../commands/utils";
import { assignToGroup } from "../utils";
import {
  explodeIntoPerRunResults,
  BenchmarkAggregateRunResult,
  MetricAggregate,
  MetricRunAggregate,
} from "../data/BenchmarkAggregateResult";
import { AggregationStrategy } from "../data/AggregationStrategy";
import { MetricEnum } from "../data/MetricEnum";

/**
 * End-to-end pipeline tests: mirror the flow used in summary.ts / entityBreakdown.ts
 *
 *   assignToGroup(rawResult.originalFileName, groupBy)   // identity-based group match
 *   applyLabel(rawWithGroup, trimPrefix, customNames, titleCase, trimSubstrings)  // display-only transforms
 *   explodeIntoPerRunResults(result, strategy)           // preserves originalFileName, appends "(run N)" to displayName
 *
 * These tests guard the invariant that `originalFileName` is never mutated by presentation transforms
 * so that group matching and customNames lookups continue to work regardless of trim/title-case options.
 */

const makeAggregate = (avg: number): MetricAggregate => ({
  average: avg,
  standardDeviation: 5,
  minimum: avg - 10,
  maximum: avg + 10,
  median: avg,
});

const makeRunAggregate = (run: number, avg: number): MetricRunAggregate => ({
  ...makeAggregate(avg),
  run,
});

const makeRawResult = (originalFileName: string): BenchmarkAggregateRunResult => ({
  originalFileName,
  displayName: originalFileName,
  metrics: [MetricEnum.WHOLE_UPDATE],
  runs: new Map([
    [MetricEnum.WHOLE_UPDATE.name, [makeRunAggregate(1, 1000), makeRunAggregate(2, 2000)]],
  ]),
  all: new Map([[MetricEnum.WHOLE_UPDATE.name, makeAggregate(1500)]]),
});

/** Mirrors the exact pipeline used in summary.ts / entityBreakdown.ts. */
function runPipeline(
  raw: BenchmarkAggregateRunResult,
  opts: {
    groupBy?: string[];
    trimPrefix?: string;
    customNames?: Map<string, string>;
    titleCase?: boolean;
    trimSubstrings?: string[];
  } = {},
): BenchmarkAggregateRunResult {
  const groupBy = opts.groupBy ?? [];
  const group = groupBy.length > 0 ? assignToGroup(raw.originalFileName, groupBy) : null;
  const withGroup = group !== null ? { ...raw, group } : raw;
  return applyLabel(
    withGroup,
    opts.trimPrefix ?? "",
    opts.customNames ?? new Map(),
    opts.titleCase,
    opts.trimSubstrings ?? [],
  );
}

describe("name transform pipeline", () => {
  it("group key also present in --trim-substring: group is assigned, display is stripped", () => {
    // raw filename contains "clone_0"; user wants to group by clone_0 AND strip it from labels
    const raw = makeRawResult("factory_alpha_clone_0");
    const result = runPipeline(raw, {
      groupBy: ["clone_0", "clone_1"],
      trimSubstrings: ["clone_0"],
    });

    expect(result.group).toBe("clone_0");
    expect(result.displayName).toBe("factory_alpha_");
    expect(result.originalFileName).toBe("factory_alpha_clone_0");
  });

  it("--title-case does not break group matching (underscores vs spaces)", () => {
    const raw = makeRawResult("factory_alpha_clone_0");
    const result = runPipeline(raw, {
      groupBy: ["clone_0"],
      titleCase: true,
    });

    expect(result.group).toBe("clone_0");
    expect(result.displayName).toBe("Factory Alpha Clone 0");
    expect(result.originalFileName).toBe("factory_alpha_clone_0");
  });

  it("customNames overrides all transforms but does not affect group matching", () => {
    const raw = makeRawResult("factory_alpha_clone_0");
    const customNames = new Map([["factory_alpha_clone_0", "Alpha (baseline)"]]);
    const result = runPipeline(raw, {
      groupBy: ["clone_0"],
      trimPrefix: "factory_",
      trimSubstrings: ["clone_0"],
      titleCase: true,
      customNames,
    });

    expect(result.group).toBe("clone_0");
    expect(result.displayName).toBe("Alpha (baseline)");
    expect(result.originalFileName).toBe("factory_alpha_clone_0");
  });

  it("longest-match wins: clone_18 is not confused with clone_1", () => {
    const raw1 = makeRawResult("factory_alpha_clone_1");
    const raw18 = makeRawResult("factory_alpha_clone_18");
    const groupBy = ["clone_1", "clone_18"];

    const r1 = runPipeline(raw1, { groupBy, trimSubstrings: groupBy });
    const r18 = runPipeline(raw18, { groupBy, trimSubstrings: groupBy });

    expect(r1.group).toBe("clone_1");
    expect(r18.group).toBe("clone_18");
    // trimSubstrings should also apply longest-first: "clone_18" removed before "clone_1" could match inside it
    expect(r1.displayName).toBe("factory_alpha_");
    expect(r18.displayName).toBe("factory_alpha_");
  });

  it("per-run explosion preserves originalFileName so customNames still resolves downstream", () => {
    const raw = makeRawResult("factory_alpha_clone_0");
    const customNames = new Map([["factory_alpha_clone_0", "Alpha"]]);
    const labeled = runPipeline(raw, {
      groupBy: ["clone_0"],
      customNames,
    });
    const perRun = explodeIntoPerRunResults(labeled, AggregationStrategy.AVERAGE);

    expect(perRun).toHaveLength(2);
    // displayName gets "(run N)" appended
    expect(perRun[0].displayName).toBe("Alpha (run 1)");
    expect(perRun[1].displayName).toBe("Alpha (run 2)");
    // originalFileName is preserved verbatim on every per-run entry
    expect(perRun[0].originalFileName).toBe("factory_alpha_clone_0");
    expect(perRun[1].originalFileName).toBe("factory_alpha_clone_0");
    // group tag propagates too
    expect(perRun[0].group).toBe("clone_0");
    expect(perRun[1].group).toBe("clone_0");

    // Re-applying customNames after explosion still resolves — the whole point of the refactor
    const relabeled = applyLabel(perRun[0], "", customNames);
    expect(relabeled.displayName).toBe("Alpha");
  });
});
