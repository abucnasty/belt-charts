# belt-charts

[![npm version](https://img.shields.io/npm/v/belt-charts)](https://www.npmjs.com/package/belt-charts)

A CLI tool for generating charts and visualizations from Belt benchmark verbose metrics data.

## Installation

### From npm (once published)
```bash
npm install -g belt-charts
```

### For Development
```bash
npm install
npm run build
npm link
```

## Usage

After installation, the `belt-charts` command will be globally available:

```bash
belt-charts --help
```


## Command Reference

All commands share a common set of **base options**, plus command-specific options listed below.

### Base Options (all commands)

| Option | Default | Description |
|---|---|---|
| `<glob-pattern>` | *(required)* | Glob pattern for input CSV files, e.g. `"results/*.csv"` |
| `-o, --output <file>` | `verbose_metrics.png` | Output file path. Use `.svg` for vector output |
| `-w, --width <px>` | `1400` | Chart width in pixels |
| `-h, --height <px>` | `800` | Chart height in pixels |
| `--remove-first-ticks <n>` | `1` | Skip the first N ticks (removes benchmark warm-up spikes) |
| `--max-ticks <n>` | `0` | Only include ticks up to N. `0` = no limit |
| `--trim-prefix <string>` | `""` | Strip a common prefix from all file names in chart labels |
| `--name <baseName>=<label>` | *(none)* | Override the chart label for one input file. Repeatable — use once per file. The key is the pre-trim base name (filename minus `.csv` / `_verbose_metrics`). Takes precedence over `--trim-prefix`. In per-run charts the custom label becomes the base: `<label> (run N)`. |
| `--names-file <path>` | `""` | Path to a names-mapping file. Each non-blank, non-comment line: `baseName=label`. Lines starting with `#` are comments. `--name` flags override entries in this file on duplicate keys. |
| `--metrics <list>` | *default set* | Comma-separated list of metric names to include, e.g. `"wholeUpdate,entityUpdate"`. Use `*` for all defaults |
| `--min-percent <number>` | `0` | Hide any metric/entity whose max value never exceeds this % of the reference total across all files. `0` = no filter |
| `--title-case` | `false` | Convert chart labels to space-separated title case, normalizing snake_case, kebab-case, PascalCase, camelCase, and SCREAMING_SNAKE (e.g. `belt_v2` → `Belt V2`, `BeltV2` → `Belt V2`). Applied after `--trim-prefix`; `--name` / `--names-file` overrides bypass it entirely |
| `--aggregate-file <path>` | `""` | Path to a run-results file for outlier filtering |
| `--stddev-filter <n>` | `3` | Remove runs outside N standard deviations from the mean (requires `--aggregate-file`) |

> **Label pipeline** — `--name`/`--names-file`, `--trim-prefix`, and `--title-case` are applied in order. If a `--name` match is found the custom label is used as-is and the remaining steps are skipped; otherwise `--trim-prefix` strips the leading prefix and then `--title-case` normalizes the result to space-separated title case.
>
> `--title-case` recognises snake_case (`_`), kebab-case (`-`), PascalCase, camelCase, and SCREAMING_SNAKE — all produce the same space-separated title case output:
>
> | Input | Output |
> |---|---|
> | `belt_v2` | `Belt V2` |
> | `belt-v2` | `Belt V2` |
> | `BeltV2` | `Belt V2` |
> | `beltV2` | `Belt V2` |
> | `BELT_V2` | `Belt V2` |
>
> Example with `--trim-prefix "my_map_" --title-case`:
> ```
> my_map_belt_v2_verbose_metrics.csv
>   → base name : my_map_belt_v2
>   → trim      : belt_v2
>   → title case: Belt V2
> ```
> Adding `--name "my_map_belt_v2=Belt Design v2"` bypasses both transforms and uses `Belt Design v2` directly.

---

### `summary`

Stacked-bar chart aggregating all metrics across input files, with an optional in-chart table.

| Option | Default | Description |
|---|---|---|
| `-a, --aggregate-strategy` | `average` | How to aggregate ticks per run: `average`, `minimum`, `maximum`, `median`, `standard_deviation` |
| `--summary-table <bool>` | `true` | Render a stats table inside the chart |
| `--summary-table-file <bool>` | `true` | Export the table as `.csv` and `.md` alongside the chart |
| `--title-override <string>` | *(auto)* | Override the chart title |
| `--max-update <number>` | *(auto)* | Fix the maximum x-axis value (microseconds). Useful for comparing charts at a consistent scale |

```
belt-charts summary "results/my_amazing_map*.csv"
  -w 1500 -h 800
  --remove-first-ticks 30
  -o "charts/all_metrics.png"
  -a average
  --metrics "wholeUpdate,entityUpdate,controlBehaviorUpdate,transportLinesUpdate,electricHeatFluidCircuitUpdate"
  --summary-table true
  --summary-table-file true
  --trim-prefix "my_amazing_map_"
  --name "my_amazing_map_a=Design A"
  --name "my_amazing_map_b=Design B"
  --min-percent 1
```

---

### `summary-per-run`

Same as `summary` but shows one bar per individual run instead of averaging across runs.

| Option | Default | Description |
|---|---|---|
| `-a, --aggregate-strategy` | `average` | Per-run statistic to display (`average`, `minimum`, `maximum`, `median`, `standard_deviation`) |
| `--summary-table <bool>` | `true` | Render a stats table inside the chart |
| `--summary-table-file <bool>` | `true` | Export the table as `.csv` and `.md` |
| `--title-override <string>` | *(auto)* | Override the chart title |
| `--sort-by <run\|total>` | `total` | Sort bars by run number or by total `wholeUpdate` time |

```
belt-charts summary-per-run "results/my_amazing_map*.csv"
  -w 2000 -h 1000
  --remove-first-ticks 30
  -o "charts/per_run_metrics.png"
  -a average
  --sort-by total
  --summary-table true
  --summary-table-file true
  --trim-prefix "my_amazing_map_"
```

---

### `bar` / `line`

Timeseries charts — one output file per input CSV. `bar` renders stacked areas; `line` renders lines.

| Option | Default | Description |
|---|---|---|
| `-a, --aggregate-strategy` | `average` | How to aggregate runs per tick |
| `--tick-window-aggregation <n>` | `0` | Time-weighted average over a rolling window of N ticks. `0` = no windowing |
| `--max-update <number>` | *(auto)* | Y-axis ceiling in µs. Auto-detected from data if omitted |

> When any PascalCase entity metric (e.g. `Inserter`, `AssemblingMachine`) is included in `--metrics`, `entityUpdate` is automatically excluded from the stacked areas and becomes the "Total Entity Update Average" reference line instead of "Whole Update Average".

```
belt-charts bar "results/my_amazing_map*.csv"
  -w 1200 -h 800
  --remove-first-ticks 30
  -o "charts/timeseries.png"
  -a average
  --max-ticks 18000
  --max-update 3000
  --trim-prefix "my_amazing_map_"
  --metrics "wholeUpdate,controlBehaviorUpdate,transportLinesUpdate,electricHeatFluidCircuitUpdate,entityUpdate"
  --tick-window-aggregation 60
```

---

### `boxplot`

Box-and-whisker chart showing the distribution of `wholeUpdate` across all runs per file.

| Option | Default | Description |
|---|---|---|
| `--min-update <number>` | *(auto)* | Y-axis floor in µs |
| `--max-update <number>` | *(auto)* | Y-axis ceiling in µs |

```
belt-charts boxplot "results/my_amazing_map*.csv"
  -w 1000 -h 800
  --remove-first-ticks 30
  -o "charts/run_distribution.png"
  --trim-prefix "my_amazing_map_"
```

---

### `table`

Exports aggregate statistics to `.csv` and `.md` without generating a chart image.

| Option | Default | Description |
|---|---|---|
| `-a, --aggregate-strategy` | `average` | How to aggregate runs |

```
belt-charts table "results/my_amazing_map*.csv"
  --remove-first-ticks 30
  -o "charts/stats.csv"
  -a average
  --trim-prefix "my_amazing_map_"
```

---

### `entity-summary`

Stacked-bar chart decomposing `entityUpdate` into per-entity-type contributions. Requires Factorio verbose metrics CSVs that include the PascalCase per-entity columns (e.g. `Inserter`, `AssemblingMachine`).

| Option | Default | Description |
|---|---|---|
| `-a, --aggregate-strategy` | `average` | How to aggregate runs |
| `--top-n <n>` | `15` | Show only the top N entity types; the rest fold into "Other Entity Update". `0` = show all |
| `--sort-by <run\|total>` | `total` | (`entity-summary-per-run` only) Sort bars by run number or by entityUpdate total |
| `--summary-table <bool>` | `true` | Render a stats table inside the chart |
| `--summary-table-file <bool>` | `true` | Export the table as `.csv` and `.md` |
| `--title-override <string>` | *(auto)* | Override the chart title |

```
belt-charts entity-summary "results/my_amazing_map*.csv"
  -w 1600 -h 1000
  --remove-first-ticks 30
  -o "charts/entity_summary.png"
  -a average
  --top-n 15
  --min-percent 1
  --summary-table true
  --summary-table-file true
  --trim-prefix "my_amazing_map_"
```

---

### `entity-summary-per-run`

Same as `entity-summary` but shows one bar per individual run (no averaging across runs).

| Option | Default | Description |
|---|---|---|
| `-a, --aggregate-strategy` | `average` | Per-run statistic to display |
| `--top-n <n>` | `15` | Top N entity types |
| `--sort-by <run\|total>` | `total` | Sort bars by run number or entityUpdate total |
| `--summary-table <bool>` | `true` | Render a stats table inside the chart |
| `--summary-table-file <bool>` | `true` | Export the table as `.csv` and `.md` |
| `--title-override <string>` | *(auto)* | Override the chart title |

```
belt-charts entity-summary-per-run "results/my_amazing_map*.csv"
  -w 1600 -h 1000
  --remove-first-ticks 30
  -o "charts/entity_summary_per_run.png"
  -a average
  --top-n 15
  --sort-by run
  --min-percent 1
  --summary-table true
  --summary-table-file true
  --trim-prefix "my_amazing_map_"
```

---

### `entity-matrix`

Panel chart — rows = entity types, columns = benchmark files, cells = horizontal bar scaled to a shared x-axis. Good for comparing the same entity type across many designs at a glance.

| Option | Default | Description |
|---|---|---|
| `-a, --aggregate-strategy` | `average` | How to aggregate runs |
| `--top-n <n>` | `15` | Show only the top N entity types |
| `--title-override <string>` | *(auto)* | Override the chart title |

```
belt-charts entity-matrix "results/my_amazing_map*.csv"
  -w 1400 -h 800
  --remove-first-ticks 30
  -o "charts/entity_matrix.png"
  -a average
  --top-n 15
  --min-percent 1
  --trim-prefix "my_amazing_map_"
```

---

### `entity-heatmap`

2-D heatmap — rows = entity types, columns = benchmark files, cells colored by µs intensity using a viridis-style gradient.

| Option | Default | Description |
|---|---|---|
| `-a, --aggregate-strategy` | `average` | How to aggregate runs |
| `--top-n <n>` | `20` | Show only the top N entity types |
| `--normalize <global\|column\|row>` | `global` | Color scale normalization. `global` = single scale for all cells (best for spotting the absolute hottest cell); `column` = per-design scale (best for comparing entity profiles within one design); `row` = per-entity scale (best for spotting which design stresses a particular entity the most) |
| `--show-values <bool>` | `true` | Render µs values inside each cell |
| `--title-override <string>` | *(auto)* | Override the chart title |

```
belt-charts entity-heatmap "results/my_amazing_map*.csv"
  -w 1400 -h 900
  --remove-first-ticks 30
  -o "charts/entity_heatmap_global.png"
  -a average
  --top-n 20
  --min-percent 1
  --normalize global
  --show-values true
  --trim-prefix "my_amazing_map_"
```

---

## SVG Export

All chart commands support SVG output in addition to PNG. The format is inferred from the `--output` file extension — simply use `.svg` instead of `.png`:

```bash
belt-charts summary "results/*.csv" -o "charts/summary.svg" ...
belt-charts boxplot "results/*.csv" -o "charts/boxplot.svg" ...
belt-charts bar "results/*.csv" -o "charts/timeseries.svg" ...
```

SVG files are rendered using [skia-canvas](https://github.com/samizdatco/skia-canvas)'s native vector backend, producing true vector output rather than an embedded bitmap. This makes them resolution-independent and suitable for embedding in reports or web pages.

For `line` and `bar` commands (which generate one file per input CSV), the extension is preserved per-file:

```bash
# Input: results/map_a.csv, results/map_b.csv
# Output: charts/timeseries_map_a.svg, charts/timeseries_map_b.svg
belt-charts bar "results/*.csv" -o "charts/timeseries.svg" ...
```

PNG is the default when no extension is specified or when `.png` is used.

## Requirements

- Node.js >= 14.0.0
- npm or yarn

## License

MIT