# Refactor Backlog

Items identified during maintainability review. Check off as completed.

---

## P0 — Active Code Rot

- [x] **Extract `backgroundPlugin`** — identical Chart.js black-background plugin is copy-pasted
  into `BoxPlot.ts`, `LineChart.ts`, and `SummaryChart.ts`. Extract to `src/charts/plugins.ts`.

- [x] **Shared CSV reader** — `parseBenchmarkAveragePerTickResultFromCsv` and
  `parseBenchmarkAggregatesPerRunResultFromCsv` share identical `fs.createReadStream` +
  `csv-parser` boilerplate, run filtering, and error handling. Extract a shared
  `readCsvRows(filePath, filter)` utility.

- [x] **Move `csvExportPlugin` I/O out of `afterDraw`** — `csvExportPlugin` in `SummaryChart.ts`
  calls `fs.writeFileSync()` inside the Chart.js `afterDraw()` callback. Errors are swallowed
  silently. Move export to the command handler, after rendering completes.

- [x] **Pure `applyTrimPrefix()`** — `applyTrimPrefix()` in `src/commands/utils.ts` mutates its
  input. Either make it pure (return `{ ...result, fileName: ... }`) or rename to
  `trimPrefixInPlace()` to signal intent.

---

## P1 — Type Safety

- [x] **Enable `strict: true` in tsconfig** — currently `strict: false`, disabling
  `strictNullChecks`, `noImplicitAny`, and `strictFunctionTypes`. Enable and fix fallout.

- [x] **Fix `explodeIntoPerRunResults` return type** — returns `BenchmarkAggregateRunResult[]`
  but each item represents a single run (the `.runs` map has one entry). Introduce a distinct
  type (e.g. `SingleRunResult`) to prevent misuse.

---

## P2 — Scattered Magic Configuration

- [x] **Centralize metric profiles** — `LineChart.ts` (7 metrics) and `SummaryChart.ts` (11
  metrics) each hardcode their own `supportedMetrics` lists. Extracted to named profiles in
  `src/data/MetricRegistry.ts`: `MetricProfiles.LINE_CHART`, `MetricProfiles.SUMMARY_CHART`,
  `MetricProfiles.ALL`.

- [x] **Name magic numbers in chart files** — `LineChart.ts` uses bare `60`, `15`, `30` for
  window thresholds; `BoxPlot.ts` uses `0.9`/`1.1` for scale padding; `SummaryChart.ts` uses
  `20`/`16` for px layout. Move to named constants in `src/charts/constants.ts`.

- [x] **Delete dead export `microToNano()`** — exported from `src/utils.ts` but never called.

---

## P3 — Architecture

- [x] **Shared command pipeline** — all 6 commands independently implement: glob → filter runs →
  parse CSV(s) → build chart config → render → write PNG. Extract a
  `runChartPipeline(opts, parser, chartFactory)` helper.

- [x] **Move data transforms out of `SummaryChart.ts`** — computing "other" (whole − parts),
  sorting by total average, and calculating % decrease is data transformation, not presentation.
  Extracted `buildSummaryChartData`, `SummaryChartData`, `SummaryChartMetricValue` to `src/data/SummaryTransform.ts`.
  Move to `src/data/` so it can be tested independently.

- [x] **Rename `BenchmarkAggregates.ts`** — this file contains tick utilities
  (`ignoreFirstTicksFromResult`, `metricValueAverage`), not aggregate definitions. Renamed to
  `tickUtils.ts`; updated imports in `LineChart.ts` and `lineBar.ts`.

- [x] **Add tests** — no test infrastructure exists. Priority targets: `average()`,
  `standardDeviation()`, `explodeIntoPerRunResults()`,
  `filterRunResultsOutsideStdDeviations()`, and the CSV parsers.
  Added vitest; 42 tests across `utils.test.ts`, `explodeIntoPerRunResults.test.ts`,
  `filterRunResultsOutsideStdDeviations.test.ts`, and `buildSummaryChartData.test.ts`.
