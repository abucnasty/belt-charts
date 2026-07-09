import { Canvas } from "skia-canvas";
import { BenchmarkAggregateRunResult } from "../data/BenchmarkAggregateResult";
import { MetricEnum } from "../data/MetricEnum";
import { MetricName } from "../data/Metric";
import { MetricRegistryInstance } from "../data/MetricRegistry";
import { AggregationStrategy } from "../data/AggregationStrategy";
import { nanoToMicro } from "../utils";
import { colors } from "./constants";

// Ordered design-column palette (cycles when more files than colors)
const DESIGN_COLORS = [
  colors.blue,
  colors.orange,
  colors.green,
  colors.sky_blue,
  colors.vermillion,
  colors.reddish_purple,
  colors.yellow,
];

const OTHER_ENTITY_NAME = "otherEntityUpdate";
const OTHER_ENTITY_DESCRIPTION = "Other Entity Update";

const MIN_ROW_HEIGHT = 22; // px — prevents unreadable rows at --top-n 0
const FONT_SIZE = 12;
const LABEL_FONT = `${FONT_SIZE}px Arial`;
const BOLD_FONT = `bold ${FONT_SIZE}px Arial`;
const SMALL_FONT = `10px Arial`;

export interface EntityMatrixChartOptions {
  aggregationStrategy: AggregationStrategy;
  /** Keep top N entities by max-across-designs. 0 = all. Default 15. */
  topN: number;
  /**
   * Exclude entity rows whose max value across all designs is less than this
   * percentage of the corresponding entityUpdate total. 0 = no filter (default).
   */
  minPercent: number;
  titleOverride?: string | null;
}

interface MatrixRow {
  metricName: string;
  description: string;
  /** One value per design (aligned to results array). NaN if not present. */
  values: number[];
}

function getAggregateValue(result: BenchmarkAggregateRunResult, metricName: MetricName, strategy: AggregationStrategy): number {
  const agg = result.all.get(metricName);
  if (!agg) return NaN;
  switch (strategy) {
    case AggregationStrategy.AVERAGE: return nanoToMicro(agg.average);
    case AggregationStrategy.MINIMUM: return nanoToMicro(agg.minimum);
    case AggregationStrategy.MAXIMUM: return nanoToMicro(agg.maximum);
    case AggregationStrategy.MEDIAN: return nanoToMicro(agg.median);
    case AggregationStrategy.STANDARD_DEVIATION: return nanoToMicro(agg.standardDeviation);
  }
}

export function renderEntityMatrixChart(
  results: BenchmarkAggregateRunResult[],
  options: EntityMatrixChartOptions,
  canvas: Canvas,
): void {
  const entityChildren = MetricRegistryInstance.getChildrenOf(MetricEnum.ENTITY_UPDATE.name);

  // Build raw value matrix for all entity children
  const allRows: MatrixRow[] = entityChildren.map(metric => ({
    metricName: metric.name,
    description: metric.description,
    values: results.map(r => getAggregateValue(r, metric.name as MetricName, options.aggregationStrategy)),
  })).filter(row => row.values.some(v => !isNaN(v) && v > 0))
    .map(row => ({ ...row, values: row.values.map(v => isNaN(v) ? 0 : v) }));

  // Sort descending by max value across designs
  allRows.sort((a, b) => {
    const aMax = Math.max(...a.values.filter(v => !isNaN(v)));
    const bMax = Math.max(...b.values.filter(v => !isNaN(v)));
    return bMax - aMax;
  });

  // Apply minPercent filter: drop rows where the entity never exceeds minPercent%
  // of entityUpdate in any design.
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

  // Apply top-N
  const topN = options.topN > 0 ? options.topN : filteredRows.length;
  const topRows = filteredRows.slice(0, topN);
  const restRows = filteredRows.slice(topN);

  // Compute "Other Entity Update" row
  const entityUpdateValues = results.map((r, i) => {
    const total = getAggregateValue(r, MetricEnum.ENTITY_UPDATE.name as MetricName, options.aggregationStrategy);
    const topSum = topRows.reduce((sum, row) => {
      const v = row.values[i];
      return sum + (isNaN(v) ? 0 : v);
    }, 0);
    return Math.max(0, (isNaN(total) ? 0 : total) - topSum);
  });

  const rows: MatrixRow[] = [
    ...topRows,
    { metricName: OTHER_ENTITY_NAME, description: OTHER_ENTITY_DESCRIPTION, values: entityUpdateValues },
  ];

  const nRows = rows.length;
  const nDesigns = results.length;

  // ── Measure text to determine margins ──────────────────────────────────────

  // We need a temporary ctx to measure; use the real canvas
  const ctx = canvas.getContext("2d");

  // Left margin: widest entity label
  ctx.font = LABEL_FONT;
  const leftMargin = Math.ceil(
    Math.max(...rows.map(r => ctx.measureText(r.description).width)) + 24,
  );

  // Right margin: enough for value labels ("12345 µs")
  const rightMargin = 90;

  // Bottom margin: x-axis ticks + label
  const bottomMargin = 50;

  // Top margin: rotated design labels + title + legend
  const topMargin = 120; // title(24) + legend(32) + rotated label height(~64)

  const plotWidth = canvas.width - leftMargin - rightMargin;
  const plotAreaHeight = canvas.height - topMargin - bottomMargin;

  // Auto-fit row height; enforce minimum
  let rowHeight = Math.floor(plotAreaHeight / nRows);
  let actualCanvasHeight = canvas.height;
  if (rowHeight < MIN_ROW_HEIGHT) {
    rowHeight = MIN_ROW_HEIGHT;
    actualCanvasHeight = topMargin + nRows * rowHeight + bottomMargin;
  }

  // Resize canvas if needed
  if (actualCanvasHeight !== canvas.height) {
    (canvas as any).height = actualCanvasHeight;
  }

  // ── Shared x-axis scale ────────────────────────────────────────────────────

  const allValues = rows.flatMap(r => r.values).filter(v => !isNaN(v) && v > 0);
  const xMax = allValues.length > 0 ? Math.max(...allValues) * 1.05 : 1;

  // ── Draw ──────────────────────────────────────────────────────────────────

  const W = canvas.width;
  const H = actualCanvasHeight;

  // Black background
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, W, H);

  // ── Title ─────────────────────────────────────────────────────────────────

  const strategyLabel: Record<AggregationStrategy, string> = {
    average: "Average",
    minimum: "Minimum",
    maximum: "Maximum",
    median: "Median",
    standard_deviation: "Standard Deviation",
  };
  const title = options.titleOverride ?? `Entity Update Breakdown by Save File — ${strategyLabel[options.aggregationStrategy]} [µs]`;

  ctx.font = `bold 16px Arial`;
  ctx.fillStyle = colors.white;
  ctx.textAlign = "center";
  ctx.fillText(title, W / 2, 22);

  // ── Legend ─────────────────────────────────────────────────────────────────

  ctx.font = LABEL_FONT;
  ctx.textAlign = "left";
  const legendSwatchSize = 14;
  const legendSpacing = 16;

  // Measure total legend width to centre it
  const legendItems = results.map((r, i) => ({
    label: r.displayName,
    color: DESIGN_COLORS[i % DESIGN_COLORS.length],
    width: legendSwatchSize + 6 + ctx.measureText(r.displayName).width,
  }));
  const totalLegendWidth = legendItems.reduce((sum, it) => sum + it.width + legendSpacing, 0) - legendSpacing;
  let lx = (W - totalLegendWidth) / 2;
  const ly = 36;

  for (const item of legendItems) {
    ctx.fillStyle = item.color;
    ctx.fillRect(lx, ly, legendSwatchSize, legendSwatchSize);
    ctx.fillStyle = colors.white;
    ctx.fillText(item.label, lx + legendSwatchSize + 6, ly + legendSwatchSize - 2);
    lx += item.width + legendSpacing;
  }

  // ── X-axis ticks & labels ─────────────────────────────────────────────────

  const axisY = topMargin + nRows * rowHeight;
  const nTicks = 5;

  ctx.font = SMALL_FONT;
  ctx.fillStyle = colors.white;
  ctx.textAlign = "center";

  for (let i = 0; i <= nTicks; i++) {
    const v = (xMax / nTicks) * i;
    const x = leftMargin + (v / xMax) * plotWidth;

    // Tick mark
    ctx.strokeStyle = colors.dark_grey;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, topMargin);
    ctx.lineTo(x, axisY + 6);
    ctx.stroke();

    // Label
    ctx.fillText(`${v.toFixed(2)} µs`, x, axisY + 20);
  }

  // X-axis label
  ctx.font = LABEL_FONT;
  ctx.fillStyle = colors.white;
  ctx.textAlign = "center";
  ctx.fillText(
    `${strategyLabel[options.aggregationStrategy]} per tick [microseconds] (lower is better)`,
    leftMargin + plotWidth / 2,
    axisY + 40,
  );

  // ── Rows ──────────────────────────────────────────────────────────────────

  const barBand = rowHeight * 0.8; // total height available for all bars in a row
  const barHeight = Math.max(4, Math.floor(barBand / nDesigns) - 2);
  const bandStart = (rowHeight - barBand) / 2; // offset from top of row to first bar

  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx];
    const rowTop = topMargin + rowIdx * rowHeight;
    const rowMid = rowTop + rowHeight / 2;

    // Alternating row background for readability
    if (rowIdx % 2 === 1) {
      ctx.fillStyle = "rgba(255,255,255,0.04)";
      ctx.fillRect(leftMargin, rowTop, plotWidth, rowHeight);
    }

    // Horizontal gridline
    ctx.strokeStyle = colors.dark_grey;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(leftMargin, rowTop + rowHeight);
    ctx.lineTo(leftMargin + plotWidth, rowTop + rowHeight);
    ctx.stroke();

    // Entity name
    ctx.font = row.metricName === OTHER_ENTITY_NAME ? BOLD_FONT : LABEL_FONT;
    ctx.fillStyle = colors.white;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(row.description, leftMargin - 8, rowMid);

    // Bars (one per design)
    for (let di = 0; di < nDesigns; di++) {
      const value = row.values[di];
      if (isNaN(value) || value <= 0) continue;

      const barX = leftMargin;
      const barW = Math.max(1, (value / xMax) * plotWidth);
      const barY = rowTop + bandStart + di * (barHeight + 2);

      ctx.fillStyle = DESIGN_COLORS[di % DESIGN_COLORS.length];
      ctx.fillRect(barX, barY, barW, barHeight);

      // Value label to the right of bar
      const labelX = barX + barW + 4;
      const labelY = barY + barHeight / 2;
      if (labelX + 60 < W - 4) {
        ctx.font = SMALL_FONT;
        ctx.fillStyle = colors.white;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(`${value.toFixed(2)}`, labelX, labelY);
      }
    }
  }

  // ── Left axis border ──────────────────────────────────────────────────────
  ctx.strokeStyle = colors.dark_grey;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(leftMargin, topMargin);
  ctx.lineTo(leftMargin, axisY);
  ctx.stroke();

  ctx.textBaseline = "alphabetic";
}
