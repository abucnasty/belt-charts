import { Canvas } from "skia-canvas";
import { BenchmarkAggregateRunResult } from "../data/BenchmarkAggregateResult";
import { MetricEnum } from "../data/MetricEnum";
import { MetricName } from "../data/Metric";
import { MetricRegistryInstance } from "../data/MetricRegistry";
import { AggregationStrategy } from "../data/AggregationStrategy";
import { nanoToMicro } from "../utils";
import { colors } from "./constants";

// Viridis-inspired gradient stops [t, [r, g, b]]
// t=0 → cool/dark, t=1 → hot/bright (colorblind-friendly)
const HEAT_STOPS: [number, [number, number, number]][] = [
  [0.00, [20,  10,  40]],  // near-black purple
  [0.25, [59,  28, 140]],  // purple
  [0.50, [33, 145, 140]],  // teal
  [0.75, [94, 201,  98]],  // green
  [1.00, [253, 231, 37]],  // yellow
];

function heatColor(t: number): string {
  t = Math.max(0, Math.min(1, t));
  let lo = HEAT_STOPS[0];
  let hi = HEAT_STOPS[HEAT_STOPS.length - 1];
  for (let i = 0; i < HEAT_STOPS.length - 1; i++) {
    if (t >= HEAT_STOPS[i][0] && t <= HEAT_STOPS[i + 1][0]) {
      lo = HEAT_STOPS[i];
      hi = HEAT_STOPS[i + 1];
      break;
    }
  }
  const f = lo[0] === hi[0] ? 0 : (t - lo[0]) / (hi[0] - lo[0]);
  const r = Math.round(lo[1][0] + f * (hi[1][0] - lo[1][0]));
  const g = Math.round(lo[1][1] + f * (hi[1][1] - lo[1][1]));
  const b = Math.round(lo[1][2] + f * (hi[1][2] - lo[1][2]));
  return `rgb(${r},${g},${b})`;
}

export type HeatmapNormalizeMode = "global" | "column" | "row";

export interface EntityHeatmapChartOptions {
  aggregationStrategy: AggregationStrategy;
  /** Keep top N entity types by max-across-designs. 0 = all. */
  topN: number;
  /**
   * Exclude entity rows whose max value across all designs is less than this
   * percentage of the entityUpdate total. 0 = no filter.
   */
  minPercent: number;
  /**
   * How to normalize cell values to the 0–1 color scale.
   * - global: relative to the single hottest cell in the whole chart
   * - column: relative to the hottest cell in the same design column
   * - row: relative to the hottest cell in the same entity row
   */
  normalize: HeatmapNormalizeMode;
  /** Show numeric µs values inside each cell. */
  showValues: boolean;
  titleOverride?: string | null;
}

const OTHER_ENTITY_NAME = "otherEntityUpdate";
const OTHER_ENTITY_DESCRIPTION = "Other Entity Update";

const FONT_SIZE = 12;
const LABEL_FONT = `${FONT_SIZE}px Arial`;
const BOLD_FONT = `bold ${FONT_SIZE}px Arial`;
const SMALL_FONT = `10px Arial`;

const MIN_ROW_HEIGHT = 24;
const MIN_COL_WIDTH = 60;
const LEGEND_BAR_WIDTH = 20;
const LEGEND_MARGIN = 12;
const LEGEND_LABEL_WIDTH = 52;

interface HeatRow {
  metricName: string;
  description: string;
  values: number[]; // one per design, in µs
}

function getAggregateValue(
  result: BenchmarkAggregateRunResult,
  metricName: MetricName,
  strategy: AggregationStrategy,
): number {
  const agg = result.all.get(metricName);
  if (!agg) return NaN;
  switch (strategy) {
    case AggregationStrategy.AVERAGE:            return nanoToMicro(agg.average);
    case AggregationStrategy.MINIMUM:            return nanoToMicro(agg.minimum);
    case AggregationStrategy.MAXIMUM:            return nanoToMicro(agg.maximum);
    case AggregationStrategy.MEDIAN:             return nanoToMicro(agg.median);
    case AggregationStrategy.STANDARD_DEVIATION: return nanoToMicro(agg.standardDeviation);
  }
}

export function renderEntityHeatmapChart(
  results: BenchmarkAggregateRunResult[],
  options: EntityHeatmapChartOptions,
  canvas: Canvas,
): void {
  const entityChildren = MetricRegistryInstance.getChildrenOf(MetricEnum.ENTITY_UPDATE.name);

  // ── Build value matrix ────────────────────────────────────────────────────

  const allRows: HeatRow[] = entityChildren.map(metric => ({
    metricName: metric.name,
    description: metric.description,
    values: results.map(r => getAggregateValue(r, metric.name as MetricName, options.aggregationStrategy)),
  })).filter(row => row.values.some(v => !isNaN(v) && v > 0));

  allRows.sort((a, b) => {
    const aMax = Math.max(...a.values.filter(v => !isNaN(v)));
    const bMax = Math.max(...b.values.filter(v => !isNaN(v)));
    return bMax - aMax;
  });

  const entityUpdateTotals = results.map(r =>
    getAggregateValue(r, MetricEnum.ENTITY_UPDATE.name as MetricName, options.aggregationStrategy)
  );

  const filteredRows = options.minPercent > 0
    ? allRows.filter(row =>
        row.values.some((v, i) => {
          const total = entityUpdateTotals[i];
          return !isNaN(v) && total > 0 && (v / total) * 100 >= options.minPercent;
        })
      )
    : allRows;

  const topN = options.topN > 0 ? options.topN : filteredRows.length;
  const topRows = filteredRows.slice(0, topN);

  const otherValues = results.map((_, i) => {
    const total = entityUpdateTotals[i];
    const topSum = topRows.reduce((sum, row) => {
      const v = row.values[i];
      return sum + (isNaN(v) ? 0 : v);
    }, 0);
    return Math.max(0, (isNaN(total) ? 0 : total) - topSum);
  });

  const rows: HeatRow[] = [
    ...topRows,
    { metricName: OTHER_ENTITY_NAME, description: OTHER_ENTITY_DESCRIPTION, values: otherValues },
  ];

  const nRows = rows.length;
  const nCols = results.length;

  // ── Compute normalization denominators ────────────────────────────────────

  const allVals = rows.flatMap(r => r.values).filter(v => !isNaN(v) && v > 0);
  const globalMax = allVals.length > 0 ? Math.max(...allVals) : 1;

  const colMaxArr = results.map((_, ci) => {
    const vals = rows.map(r => r.values[ci]).filter(v => !isNaN(v) && v > 0);
    return vals.length > 0 ? Math.max(...vals) : 1;
  });

  const rowMaxArr = rows.map(row => {
    const vals = row.values.filter(v => !isNaN(v) && v > 0);
    return vals.length > 0 ? Math.max(...vals) : 1;
  });

  function getNorm(value: number, ri: number, ci: number): number {
    if (isNaN(value) || value <= 0) return 0;
    switch (options.normalize) {
      case "global": return value / globalMax;
      case "column": return value / colMaxArr[ci];
      case "row":    return value / rowMaxArr[ri];
    }
  }

  // ── Layout ────────────────────────────────────────────────────────────────

  const ctx = canvas.getContext("2d");

  ctx.font = LABEL_FONT;
  const leftMargin = Math.ceil(Math.max(...rows.map(r => ctx.measureText(r.description).width)) + 24);

  // Column header height: 45° rotation, so label length ≈ diagonal height
  const maxColLabelChars = Math.max(...results.map(r => r.fileName.length));
  const colLabelHeight = Math.min(140, maxColLabelChars * 6 + 16);
  const bottomMargin = colLabelHeight + 12;

  const topMargin = 50;
  const rightMargin = LEGEND_BAR_WIDTH + LEGEND_MARGIN + LEGEND_LABEL_WIDTH;

  const plotWidth  = canvas.width  - leftMargin - rightMargin;
  const plotHeight = canvas.height - topMargin  - bottomMargin;

  const colWidth  = Math.max(MIN_COL_WIDTH,  Math.floor(plotWidth  / nCols));
  const rowHeight = Math.max(MIN_ROW_HEIGHT, Math.floor(plotHeight / nRows));

  const actualW = leftMargin + colWidth  * nCols + rightMargin;
  const actualH = topMargin  + rowHeight * nRows + bottomMargin;

  if (actualW !== canvas.width)  (canvas as any).width  = actualW;
  if (actualH !== canvas.height) (canvas as any).height = actualH;

  const W = (canvas as any).width  as number;
  const H = (canvas as any).height as number;

  // ── Background ────────────────────────────────────────────────────────────

  ctx.fillStyle = "#111111";
  ctx.fillRect(0, 0, W, H);

  // ── Title ─────────────────────────────────────────────────────────────────

  const strategyLabel: Record<AggregationStrategy, string> = {
    average:            "Average",
    minimum:            "Minimum",
    maximum:            "Maximum",
    median:             "Median",
    standard_deviation: "Std Dev",
  };
  const normalizeLabel: Record<HeatmapNormalizeMode, string> = {
    global: "global scale",
    column: "per-design scale",
    row:    "per-entity scale",
  };
  const title =
    options.titleOverride ??
    `Entity Update Heatmap — ${strategyLabel[options.aggregationStrategy]} [µs] (${normalizeLabel[options.normalize]})`;

  ctx.font = "bold 16px Arial";
  ctx.fillStyle = colors.white;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(title, leftMargin + (colWidth * nCols) / 2, 28);

  // ── Grid cells ────────────────────────────────────────────────────────────

  for (let ri = 0; ri < rows.length; ri++) {
    const row    = rows[ri];
    const rowTop = topMargin + ri * rowHeight;

    // Row label
    ctx.font          = row.metricName === OTHER_ENTITY_NAME ? BOLD_FONT : LABEL_FONT;
    ctx.fillStyle     = colors.white;
    ctx.textAlign     = "right";
    ctx.textBaseline  = "middle";
    ctx.fillText(row.description, leftMargin - 8, rowTop + rowHeight / 2);

    for (let ci = 0; ci < nCols; ci++) {
      const value = row.values[ci];
      const t     = getNorm(value, ri, ci);
      const cellX = leftMargin + ci * colWidth;
      const cellY = rowTop;

      // Cell fill
      ctx.fillStyle = heatColor(t);
      ctx.fillRect(cellX, cellY, colWidth, rowHeight);

      // Cell border
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth   = 0.5;
      ctx.strokeRect(cellX, cellY, colWidth, rowHeight);

      // Optional value text
      if (options.showValues && !isNaN(value) && value > 0) {
        const label = value >= 100 ? value.toFixed(0) : value.toFixed(1);
        ctx.font         = SMALL_FONT;
        ctx.textAlign    = "center";
        ctx.textBaseline = "middle";
        if (ctx.measureText(label).width < colWidth - 4) {
          // Dark text on bright cells, light text on dark cells
          ctx.fillStyle = t > 0.65 ? "rgba(0,0,0,0.85)" : colors.white;
          ctx.fillText(label, cellX + colWidth / 2, cellY + rowHeight / 2);
        }
      }
    }
  }

  // ── Column headers (rotated –45°) ─────────────────────────────────────────

  const headerBaseY = topMargin + rowHeight * nRows + 8;
  ctx.font         = LABEL_FONT;
  ctx.fillStyle    = colors.white;
  ctx.textAlign    = "right";
  ctx.textBaseline = "middle";

  for (let ci = 0; ci < nCols; ci++) {
    const cx = leftMargin + ci * colWidth + colWidth / 2;
    ctx.save();
    ctx.translate(cx, headerBaseY);
    ctx.rotate(-Math.PI / 4);
    ctx.fillText(results[ci].fileName, 0, 0);
    ctx.restore();
  }

  // ── Color scale legend ────────────────────────────────────────────────────

  const legendX = leftMargin + colWidth * nCols + LEGEND_MARGIN;
  const legendY = topMargin;
  const legendH = rowHeight * nRows;
  const steps   = 120;
  const stepH   = legendH / steps;

  for (let i = 0; i < steps; i++) {
    const t = 1 - i / steps; // top = hot
    ctx.fillStyle = heatColor(t);
    ctx.fillRect(legendX, legendY + i * stepH, LEGEND_BAR_WIDTH, stepH + 1);
  }

  ctx.strokeStyle = colors.dark_grey;
  ctx.lineWidth   = 1;
  ctx.strokeRect(legendX, legendY, LEGEND_BAR_WIDTH, legendH);

  ctx.font         = SMALL_FONT;
  ctx.fillStyle    = colors.white;
  ctx.textAlign    = "left";
  ctx.textBaseline = "middle";

  const nLegendTicks = 5;
  for (let i = 0; i <= nLegendTicks; i++) {
    const t = 1 - i / nLegendTicks;
    const y = legendY + (i / nLegendTicks) * legendH;

    const label = options.normalize === "global"
      ? `${(t * globalMax).toFixed(1)} µs`
      : `${(t * 100).toFixed(0)}%`;

    ctx.fillText(label, legendX + LEGEND_BAR_WIDTH + 5, y);

    ctx.strokeStyle = colors.dark_grey;
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(legendX + LEGEND_BAR_WIDTH, y);
    ctx.lineTo(legendX + LEGEND_BAR_WIDTH + 4, y);
    ctx.stroke();
  }

  ctx.textBaseline = "alphabetic";
}
