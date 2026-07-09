# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.8.1] - 2026-07-08

### Fixed
- Entity summary chart now treats missing entity child columns as `0` instead of `NaN` when a metric column is absent from a CSV file. Previously, if one benchmark included a child entity (e.g. `Furnace`) and another did not, the missing values parsed as `NaN`, which propagated into the "Other Entity Update" calculation and produced `NaN` in the chart and exported table.

## [1.8.0] - 2026-07-08

### Added
- `--group-by <keys>` option on `summary` and `entity-summary` commands: comma-separated list of group keys (e.g. `clone_0,clone_1,clone_18`). Each result is assigned to the longest key that is a substring of its label (longest-match wins, so `clone_18` beats `clone_1`). Results that don't match any key are excluded. Matched results are clustered under bold sky-blue group headers (`▸ groupName`) injected into the y-axis, sorted by the order keys appear in the list.
- `--trim-substring <string>` base option on **all** commands: removes all occurrences of an exact substring from chart labels. Repeatable — use once per substring (e.g. `--trim-substring clone_0 --trim-substring clone_1`). Applied after `--trim-prefix` and before `--title-case`; bypassed for entries with an explicit `--name` override. When multiple substrings overlap (e.g. `clone_1` is a substring of `clone_18`), longer substrings are removed first to prevent partial matches.
- When `--group-by` is active, the markdown/CSV table export gains a **Group** column as its first column, showing which group each row belongs to.

### Changed
- `--title-case` now accepts an optional boolean value (`--title-case true` / `--title-case false`) in addition to the bare flag, for use in scripts where the value may be set conditionally.

### Internal
- Refactored the label pipeline to split the overloaded `fileName` field into two explicit fields on every result object: `originalFileName` (immutable, set at parse time) and `displayName` (mutable, transformed by the label pipeline). Group matching and `--name`/`--names-file` lookups now operate against `originalFileName` so they remain correct regardless of what `--trim-prefix`, `--trim-substring`, or `--title-case` does to the visible label. This eliminates a class of bugs where transforms applied before group assignment could strip or recase the group key, causing results to be silently excluded from the chart.

## [1.7.0] - 2026-07-08

### Added
- Summary chart now renders a single white bar per benchmark when `--metrics wholeUpdate` is the only configured metric, instead of showing a misleading "Other" category that consumed the full bar width.

## [1.6.1] - 2026-07-08

### Fixed
- Entity heatmap and entity matrix charts now treat missing entities as `0` instead of `NaN` when another benchmark includes that entity. This prevents NaN from contaminating the "Other Entity Update" row.

## [1.6.0] - 2026-07-03

### Added
- `--max-update <number>` option on the `summary` command: sets the maximum x-axis value (in microseconds) for the summary chart, useful for comparing charts at a consistent scale.

## [1.5.1] - 2026-07-03

### Fixed
- `skia-canvas` native binary now downloads automatically on first run instead of relying on a `postinstall` lifecycle script. Setting `ignore-scripts=true` globally in `~/.npmrc` (or via `npm config set ignore-scripts true`) is a recommended supply-chain security practice that prevents malicious packages from executing arbitrary commands during `npm install` — but it also silently skips legitimate native-binary setup scripts like skia-canvas's. Moving the download to first-run means belt-charts works correctly regardless of that setting. Previously this resulted in a cryptic `Cannot find module '../skia.node'` error with no recovery path.

## [1.5.0] - 2026-07-01

### Added
- `--title-case` base option on **all** commands: converts chart labels to space-separated title case, normalizing snake_case, kebab-case, PascalCase, camelCase, and SCREAMING_SNAKE (e.g. `60_electric_network_bench` → `60 Electric Network Bench`, `BeltV2` → `Belt V2`). Applied as the final step in the label pipeline — after `--trim-prefix` — and bypassed entirely for entries that have an explicit `--name` or `--names-file` override.

## [1.4.0] - 2026-07-01

### Added
- `--name <baseName>=<label>` base option on **all** commands: map an input file's base name to a custom chart label. Repeatable — use once per file. The key is the pre-trim base name (filename minus `.csv` / `_verbose_metrics`). Custom names take precedence over `--trim-prefix`. In per-run charts the label propagates into every bar: `<label> (run N)`.
- `--names-file <path>` base option on **all** commands: path to a flat text file of name mappings (`baseName=label` per line, `#` comment lines, blank lines ignored). `--name` flag entries override file entries on duplicate keys.

### Changed
- Per-run label format changed from `<name> run N` to `<name> (run N)` for readability. This affects `summary-per-run`, `entity-summary-per-run`, and the `--sort-by run` option on those commands.

## [1.3.1] - 2026-06-25

### Changed
- Inserter arm-silhouette pattern is no longer shown by default; pass the hidden flag (aquillo veterans can find it) to `entity-summary`, `entity-summary-per-run`, `entity-matrix`, or `entity-heatmap` to enable it as an easter egg

## [1.3.0] - 2026-06-25

### Added
- `-v, --version` flag to display the current version

## [1.2.1] - 2026-06-25

### Fixed
- `--trim-prefix` now correctly applies to `entity-summary`, `entity-matrix`, and `entity-heatmap` commands (return value of `applyTrimPrefix` was previously discarded)

## [1.2.0]

### Added
- `entity-summary` command for stacked-bar charts decomposing `entityUpdate` into its per-entity-type contributions, with an automatic `Other Entity Update` remainder slice
- `entity-summary-per-run` command for per-run variant of `entity-summary`, showing one bar per run
- `entity-matrix` command for panel charts comparing entity types across multiple benchmark files; rows = entity types, columns = designs (input files), shared x-axis scale, top-N filtering
- `entity-heatmap` command for a 2-D heatmap comparing entity-type µs values across benchmark files; viridis color scale, three normalization modes (`global`, `column`, `row`), optional in-cell value labels
- `--top-n` flag on entity summary/matrix/heatmap commands
- `--min-percent <number>` base option on **all** commands: hides any metric/entity whose max value never exceeds this percentage of the reference total (e.g. `wholeUpdate` for summary charts, `entityUpdate` for entity charts) across all input files; default `0` (no filter)
- Registered the 65 PascalCase entity-update child metrics exposed by Factorio's verbose benchmark output (`Inserter`, `AssemblingMachine`, `Locomotive`, etc.); each is tagged with `parent: "entityUpdate"`
- Registered new top-level `pollutionUpdate` metric
- Entity breakdown timeseries: passing any PascalCase entity metric in `--metrics` on the `bar`/`line` commands automatically switches the reference line from "Whole Update Average" to "Total Entity Update Average" and removes `entityUpdate` from the stacked areas to avoid double-counting

### Changed
- `--metrics` help text now shows human-readable examples instead of a JSONified array of metric objects
- Entity child metrics now use the colorblind-friendly palette (green, sky blue, reddish purple, teal, lavender, lime, cyan, coral, indigo, mint) instead of the extended unfriendly color set; no patterns on most entities
- `AssemblingMachine` pinned to solid blue, `Inserter` pinned to yellow with a custom arm-silhouette pattern, `MiningDrill` pinned to vermillion, `Furnace` pinned to orange — these four are always visually distinct
- CSV parsers now warn-and-skip unknown columns instead of throwing, so the tool no longer hard-fails on future Factorio metrics
- `bar`/`line` commands now pass the caller's `--metrics` list through to the chart, replacing the previous hardcoded allow-list; the default set is unchanged when `--metrics` is not provided
- Legend swatch size increased to 20×40 px so pattern tiles render fully without clipping

## [1.1.2] - 2026-06-20

### Fixed
- Correct `postinstall` script to invoke `skia-canvas`'s `prebuild.mjs` directly instead of `npm rebuild`, which does not re-run custom install scripts.

## [1.1.1] - 2026-06-20

### Fixed
- Add `postinstall` script to rebuild `skia-canvas` native binaries after global installation, resolving `Cannot find module '../skia.node'` errors on fresh installs.

## [1.1.0] - 2026-06-20

### Added
- SVG export support for all chart commands. Pass a `.svg` extension to `--output` to produce vector output (e.g. `-o charts/summary.svg`). Format is inferred from the file extension; PNG remains the default.

## [1.0.1] - 2026-06-20

### Fixed
- Avoid bundling host-specific `skia-canvas` native binaries in published artifacts, preventing `ERR_DLOPEN_FAILED` / `invalid ELF header` errors after npm install on other platforms.

## [1.0.0] - 2026-06-16

### Added
- Initial release of belt-charts CLI tool
- `summary` command for generating summary charts with aggregate statistics
- `summary-per-run` command for showing metrics for individual runs
- `line` command for generating line charts showing metrics over time
- `bar` command for generating bar charts showing metrics over time
- `boxplot` command for generating boxplot charts showing distribution statistics
- `table` command for exporting aggregate statistics to CSV
- Support for glob patterns to process multiple CSV files
- Configurable chart dimensions (width/height)
- Metric filtering and aggregation strategies
- Summary tables with optional CSV export
- Trim prefix option for cleaner chart labels
- Remove first ticks option for benchmark warm-up periods
- Tick window aggregation for timeseries data
- Cross-platform support (Linux, macOS, Windows)
- Node.js 14+ compatibility

[Unreleased]: https://github.com/abucnasty/belt-charts/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/abucnasty/belt-charts/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/abucnasty/belt-charts/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/abucnasty/belt-charts/releases/tag/v1.0.0
