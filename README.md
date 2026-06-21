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


## Bare Bones Documentation
Example usages. Let's assume you have the following metric files in a nested folder called "results"

1. my_amazing_map_fast
2. my_amazing_map_slow

Run Distribution (boxplot)
```
belt-charts boxplot "results/my_amazing_map*.csv"
  -w 1000
  -h 800
  --remove-first-ticks 30
  -o "charts/run_distribution.png"
  --trim-prefix "my_amazing_map_"
```

Summary Chart:
```
belt-charts summary "results/my_amazing_map*.csv"
  --title-override "All Metrics"
  -w 1500
  -h 800
  --remove-first-ticks 30
  -o "charts/all_metrics.png"
  --aggregate-strategy average
  --metrics "wholeUpdate,entityUpdate,controlBehaviorUpdate,transportLinesUpdate,electricHeatFluidCircuitUpdate"
  --summary-table true
  --trim-prefix "my_amazing_map_"
  --summary-table-file true
```

Summary Per-Run Chart (shows individual runs instead of averaging):
```
belt-charts summary-per-run "results/my_amazing_map*.csv"
  -w 2000
  -h 1000
  --remove-first-ticks 30
  -o "charts/per_run_metrics.png"
  --aggregate-strategy average
  --metrics "wholeUpdate,entityUpdate,controlBehaviorUpdate,transportLinesUpdate,electricHeatFluidCircuitUpdate"
  --summary-table true
  --summary-table-file true
  --trim-prefix "my_amazing_map_"
  --sort-by total
```

Timeseries graphs:
```
belt-charts bar "results/my_amazing_map*.csv"
  -w 1200
  -h 800
  --remove-first-ticks 30
  -o "charts/timeseries.png"
  -a "average"
  --max-ticks 18000
  --max-update 3000
  --trim-prefix "my_amazing_map_"
  --metrics "wholeUpdate,controlBehaviorUpdate,transportLinesUpdate,electricHeatFluidCircuitUpdate,electricNetworkUpdate,entityUpdate"
  --tick-window-aggregation 60
```

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