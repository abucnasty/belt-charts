- Small CLI for generating charts with belt
- Highly WIP

To install:

```
npm install
npm run build
npm link
```

To run:
```
belt-charts --help
```


## Bare Bones Documentation
Example usages...

Run Distribution
```
belt-charts "results/bm_*.csv"
    -w 1200
    -h 800
    --type "boxplot"
    --remove-first-ticks 60
    --aggregate-strategy "average"
    --metrics "wholeUpdate,controlBehaviorUpdate,transportLinesUpdate,electricHeatFluidCircuitUpdate,electricNetworkUpdate,fluidFlowUpdate,entityUpdate,trains"
    -o "charts/summary_run_distribution_all.png"
    --trim-prefix "bm_prod_mod_"
```

Summary Chart:
```
belt-charts "results/bm_*.csv"
    -w 1800
    -h 800
    --type "summary"
    --remove-first-ticks 60
    -o "charts/summary_verbose_metrics_all.png"
    --aggregate-strategy "average"
    --trim-prefix "bm_prod_mod_"
    --metrics "wholeUpdate,controlBehaviorUpdate,transportLinesUpdate,electricHeatFluidCircuitUpdate,electricNetworkUpdate,fluidFlowUpdate,entityUpdate,trains"
    --summary-table false
    --summary-table-file true
```

Timeseries graphs:
```
belt-charts "results/bm_*.csv"
    -w 1400
    -h 800
    --type "bar"
    --remove-first-ticks 60
    -o "charts/timeseries.png"
    --trim-prefix "bm_prod_mod_"
    --aggregate-strategy "average"
    --metrics "wholeUpdate,controlBehaviorUpdate,transportLinesUpdate,electricHeatFluidCircuitUpdate,electricNetworkUpdate,fluidFlowUpdate,entityUpdate,trains"
    --max-ticks 480
    --max-update 3
    --tick-window-aggregation 1
```