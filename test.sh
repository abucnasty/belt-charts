# bar — not filtered by --min-percent
# node bin/belt-charts.cjs bar "utility_science_baseline_q1_240_verbose_metrics.csv" \
# --remove-first-ticks 1 \
# -o "charts/entity_timeseries.png" \
# --max-ticks 1800 \
# --metrics "entityUpdate,Inserter,AssemblingMachine,MiningDrill,Loader,Furnace,Lab,Boiler,Generator,Reactor" \
# --tick-window-aggregation 1 \
# --max-update 2200

# entity-summary — filtered: hides entity children below --min-percent % of entityUpdate
# node bin/belt-charts.cjs entity-summary "utility_science_*.csv" \
# --remove-first-ticks 1 \
# -o "charts/entity_summary.png" \
# --min-percent 1 \
# --trim-prefix "utility_science_"

# # entity-matrix — filtered: hides rows below --min-percent % of entityUpdate
# node bin/belt-charts.cjs entity-matrix "utility_science_*.csv" \
# --remove-first-ticks 1 \
# -o "charts/entity_matrix.png" \
# --top-n 20 \
# --min-percent 1 \
# --trim-prefix "utility_science_"

# # entity-heatmap — filtered: hides rows below --min-percent % of entityUpdate
# node bin/belt-charts.cjs entity-heatmap "utility_science_*.csv" \
# --remove-first-ticks 1 \
# -o "charts/entity_heatmap_global.png" \
# --max-ticks 1800 \
# --top-n 20 \
# --min-percent 1 \
# --normalize global \
# --show-values true \
# --trim-prefix "utility_science_"

# node bin/belt-charts.cjs entity-heatmap "utility_science_*.csv" \
# --remove-first-ticks 1 \
# -o "charts/entity_heatmap_column.png" \
# --max-ticks 1800 \
# --top-n 20 \
# --min-percent 1 \
# --normalize column \
# --show-values true \
# --trim-prefix "utility_science_"

# node bin/belt-charts.cjs entity-heatmap "utility_science_*.csv" \
# --remove-first-ticks 1 \
# -o "charts/entity_heatmap_row.png" \
# --max-ticks 1800 \
# --top-n 20 \
# --min-percent 1 \
# --normalize row \
# --show-values true \
# --trim-prefix "utility_science_"


clone_number=18
ticks_trim=3600
total_belts=$((48 + 48 * clone_number))
node bin/belt-charts.cjs entity-summary "/home/abucnasty/dev/factorio-benchmarks/benchmarks/2026-07-05-rgb-science-revisit-2.1.9/results_clone_$clone_number/bm_red_*.csv" \
-w 1200 \
-h 700 \
--remove-first-ticks $ticks_trim \
--top-n 4 \
-o "charts/metrics_entity_breakdown_clone_$clone_number.png" \
--aggregate-strategy "average" \
--trim-prefix "bm_red_" \
--trim-substring "_clone_$clone_number" \
--title-override "$total_belts Stacked Turbo Belts (Clones $clone_number) Entity Breakdown Metrics (18k Ticks, 32 Runs)" \
--summary-table true