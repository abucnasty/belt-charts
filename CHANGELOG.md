# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- `entity-breakdown` command for stacked-bar charts decomposing `entityUpdate` into its per-entity-type contributions, with an automatic `Other Entity Update` remainder slice
- `--top-n` and `--per-run` flags on the new entity breakdown command
- Registered the 65 PascalCase entity-update child metrics exposed by Factorio's verbose benchmark output (`Inserter`, `AssemblingMachine`, `Locomotive`, etc.); each is tagged with `parent: "entityUpdate"`
- Registered new top-level `pollutionUpdate` metric
- Deterministic color+pattern assignment for entity-child metrics so the same entity gets the same style across runs

### Changed
- CSV parsers now warn-and-skip unknown columns instead of throwing, so the tool no longer hard-fails on future Factorio metrics

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

[Unreleased]: https://github.com/abucnasty/belt-charts/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/abucnasty/belt-charts/releases/tag/v1.0.0
