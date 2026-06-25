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

Entity Breakdown Chart (requires Factorio verbose metrics CSVs that include the PascalCase per-entity columns under `entityUpdate`):
```
belt-charts entity-breakdown "results/my_amazing_map*.csv"
  -w 1600
  -h 1000
  --remove-first-ticks 30
  -o "charts/entity_breakdown.png"
  -a "average"
  --top-n 15
  --summary-table true
  --summary-table-file true
  --trim-prefix "my_amazing_map_"
```

Entity Breakdown Chart (per-run):
```
belt-charts entity-breakdown "results/my_amazing_map*.csv"
  -w 1600
  -h 1000
  --remove-first-ticks 30
  -o "charts/entity_breakdown_per_run.png"
  -a "average"
  --top-n 15
  --per-run true
  --sort-by run
  --summary-table true
  --summary-table-file true
  --trim-prefix "my_amazing_map_"
```

Entity Breakdown Timeseries (stacked bar over time, one chart per file):
When any entity-type metric (PascalCase) is included in `--metrics`, `entityUpdate` is
automatically excluded from the stacked areas and becomes the "Total Entity Update Average"
reference line instead of "Whole Update Average".
```
belt-charts bar "results/my_amazing_map*.csv"
  -w 1400
  -h 800
  --remove-first-ticks 1
  -o "charts/entity_timeseries.png"
  -a "average"
  --max-ticks 1800
  --max-update 2200
  --trim-prefix "my_amazing_map_"
  --metrics "entityUpdate,Inserter,AssemblingMachine,MiningDrill,Loader,Furnace,Lab,Boiler,Generator,Reactor"
  --tick-window-aggregation 1
```

Entity Matrix Chart (panel view — rows = entity types, columns = designs/files, shared x-axis):
```
belt-charts entity-matrix "results/my_amazing_map*.csv"
  -w 1400
  -h 800
  --remove-first-ticks 30
  -o "charts/entity_matrix.png"
  -a "average"
  --top-n 15
  --trim-prefix "my_amazing_map_"
```

## Requirements

- Node.js >= 14.0.0
- npm or yarn

## License

MIT