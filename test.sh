prefix="/home/abucnasty/dev/factorio-benchmarks/competitions/2025-Q1-Nauvis/utility-science/benchmarks/round_01_factorio_2_1"
# initial ticks to remove
ticks_trim="120"
# total number of ticks for timeseries charts
ticks_total="3600"
# results folder
results_folder="$prefix/results"
# output folder
output_folder="charts"


node dist/index.js bar "$results_folder/utility_science_*.csv" \
    -w 1400 \
    -h 800 \
    --remove-first-ticks 1 \
    -o "$output_folder/timeseries.png" \
    -a "average" \
    --max-ticks 36000 \
    --metrics "wholeUpdate,controlBehaviorUpdate,transportLinesUpdate,electricHeatFluidCircuitUpdate,entityUpdate,trains,particleUpdate" \
    --tick-window-aggregation 60