import { Canvas } from "skia-canvas";
import { AggregationStrategy } from "../data/AggregationStrategy";
import { CpuFrequencyResult, RunCoreFrequencyProfile, getCoreFrequencyStatValue } from "../data/CpuFrequencyResult";
import { colors } from "./constants";
import { heatColor, HeatmapNormalizeMode } from "./heatmapColor";

export type { HeatmapNormalizeMode };

export interface CoreFrequencyHeatmapChartOptions {
  /** Which per-core statistic to display/color. */
  aggregateStrategy: AggregationStrategy;
  /**
   * How to normalize cell values to the 0–1 color scale.
   * - global: relative to the single hottest cell in the whole chart
   * - column: relative to the hottest cell in the same core column (systematic hardware differences)
   * - row: relative to the hottest cell in the same run (which core stood out within that run)
   */
  normalize: HeatmapNormalizeMode;
  /** Show numeric MHz values inside each cell. */
  showValues: boolean;
  titleOverride?: string | null;
}

const FONT_SIZE = 12;
const LABEL_FONT = `${FONT_SIZE}px Arial`;
const SMALL_FONT = `10px Arial`;

const MIN_ROW_HEIGHT = 24;
const MIN_COL_WIDTH = 60;
const LEGEND_BAR_WIDTH = 20;
const LEGEND_MARGIN = 12;
const LEGEND_LABEL_WIDTH = 60;

interface HeatmapRow {
  designLabel: string;
  run: number;
  displayName: string;
  /** Indexed by core index; undefined where a file doesn't report that many cores. */
  cores: (number | undefined)[];
}

function flattenRows(results: CpuFrequencyResult[], nCols: number, strategy: AggregationStrategy): HeatmapRow[] {
  const rows: HeatmapRow[] = [];
  for (const result of results) {
    for (const run of result.runs as RunCoreFrequencyProfile[]) {
      const cores: (number | undefined)[] = new Array(nCols).fill(undefined);
      for (const core of run.cores) {
        cores[core.coreIndex] = getCoreFrequencyStatValue(core, strategy);
      }
      rows.push({
        designLabel: result.displayName,
        run: run.run,
        displayName: `${result.displayName} (run ${run.run})`,
        cores,
      });
    }
  }
  return rows;
}

export function renderCoreFrequencyHeatmapChart(
  results: CpuFrequencyResult[],
  options: CoreFrequencyHeatmapChartOptions,
  canvas: Canvas,
): void {
  const nCols = Math.max(1, ...results.flatMap(r => r.runs.flatMap(run => run.cores.map(c => c.coreIndex + 1))));
  const rows = flattenRows(results, nCols, options.aggregateStrategy);

  rows.sort((a, b) => {
    const designCompare = a.designLabel.localeCompare(b.designLabel);
    if (designCompare !== 0) return designCompare;
    return a.run - b.run;
  });

  const nRows = rows.length;

  // ── Compute normalization denominators ────────────────────────────────────
  // Scaled from each scope's own min→max (not 0→max) so narrow-range data (e.g. clock
  // speeds bunched in the top few %) spreads across the full color gradient instead of
  // collapsing into a sliver at the hot end.

  const allVals = rows.flatMap(r => r.cores.filter((v): v is number => v !== undefined));
  const globalMin = allVals.length > 0 ? Math.min(...allVals) : 0;
  const globalMax = allVals.length > 0 ? Math.max(...allVals) : 1;

  const colMinArr = Array.from({ length: nCols }, (_, ci) => {
    const vals = rows.map(r => r.cores[ci]).filter((v): v is number => v !== undefined);
    return vals.length > 0 ? Math.min(...vals) : 0;
  });
  const colMaxArr = Array.from({ length: nCols }, (_, ci) => {
    const vals = rows.map(r => r.cores[ci]).filter((v): v is number => v !== undefined);
    return vals.length > 0 ? Math.max(...vals) : 1;
  });

  const rowMinArr = rows.map(r => {
    const vals = r.cores.filter((v): v is number => v !== undefined);
    return vals.length > 0 ? Math.min(...vals) : 0;
  });
  const rowMaxArr = rows.map(r => {
    const vals = r.cores.filter((v): v is number => v !== undefined);
    return vals.length > 0 ? Math.max(...vals) : 1;
  });

  function scale(value: number, lo: number, hi: number): number {
    return hi > lo ? (value - lo) / (hi - lo) : 1;
  }

  function getNorm(value: number, ri: number, ci: number): number {
    switch (options.normalize) {
      case "global": return scale(value, globalMin, globalMax);
      case "column": return scale(value, colMinArr[ci], colMaxArr[ci]);
      case "row": return scale(value, rowMinArr[ri], rowMaxArr[ri]);
    }
  }

  // ── Layout ───────────────────────────────────────────────────────────────

  const ctx = canvas.getContext("2d");

  ctx.font = LABEL_FONT;
  const leftMargin = Math.ceil(Math.max(...rows.map(r => ctx.measureText(r.displayName).width)) + 24);

  const colLabelHeight = 60; // "Core N" rotated -45°
  const bottomMargin = colLabelHeight + 12;
  const topMargin = 50;
  const rightMargin = LEGEND_BAR_WIDTH + LEGEND_MARGIN + LEGEND_LABEL_WIDTH;

  const plotWidth = canvas.width - leftMargin - rightMargin;
  const plotHeight = canvas.height - topMargin - bottomMargin;

  const colWidth = Math.max(MIN_COL_WIDTH, Math.floor(plotWidth / nCols));
  const rowHeight = Math.max(MIN_ROW_HEIGHT, Math.floor(plotHeight / Math.max(1, nRows)));

  const gridHeight = nRows * rowHeight;
  const actualW = leftMargin + colWidth * nCols + rightMargin;
  const actualH = topMargin + gridHeight + bottomMargin;

  if (actualW !== canvas.width) (canvas as any).width = actualW;
  if (actualH !== canvas.height) (canvas as any).height = actualH;

  const W = (canvas as any).width as number;
  const H = (canvas as any).height as number;

  // ── Background ─────────────────────────────────────────────────────────────

  ctx.fillStyle = "#111111";
  ctx.fillRect(0, 0, W, H);

  // ── Title ──────────────────────────────────────────────────────────────────

  const strategyLabel: Record<AggregationStrategy, string> = {
    average: "Average",
    minimum: "Minimum",
    maximum: "Maximum",
    median: "Median",
    standard_deviation: "Std Dev",
  };
  const normalizeLabel: Record<HeatmapNormalizeMode, string> = {
    global: "global scale",
    column: "per-core scale",
    row: "per-run scale",
  };
  const title =
    options.titleOverride ??
    `Core Frequency Heatmap \u2014 ${strategyLabel[options.aggregateStrategy]} [MHz] (${normalizeLabel[options.normalize]})`;

  ctx.font = "bold 16px Arial";
  ctx.fillStyle = colors.white;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(title, leftMargin + (colWidth * nCols) / 2, 28);

  // ── Grid rows ────────────────────────────────────────────────────────────

  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
    const y = topMargin + ri * rowHeight;

    ctx.font = LABEL_FONT;
    ctx.fillStyle = colors.white;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(row.displayName, leftMargin - 8, y + rowHeight / 2);

    for (let ci = 0; ci < nCols; ci++) {
      const value = row.cores[ci];
      const cellX = leftMargin + ci * colWidth;

      if (value === undefined) {
        ctx.fillStyle = "#1a1a1a";
        ctx.fillRect(cellX, y, colWidth, rowHeight);
      } else {
        const t = getNorm(value, ri, ci);
        ctx.fillStyle = heatColor(t);
        ctx.fillRect(cellX, y, colWidth, rowHeight);
      }

      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 0.5;
      ctx.strokeRect(cellX, y, colWidth, rowHeight);

      if (options.showValues && value !== undefined) {
        const label = `${Math.round(value)}`;
        ctx.font = SMALL_FONT;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        if (ctx.measureText(label).width < colWidth - 4) {
          const t = getNorm(value, ri, ci);
          ctx.fillStyle = t > 0.65 ? "rgba(0,0,0,0.85)" : colors.white;
          ctx.fillText(label, cellX + colWidth / 2, y + rowHeight / 2);
        }
      }
    }
  }

  // ── Column headers (rotated –45°) ─────────────────────────────────────────

  const headerBaseY = topMargin + gridHeight + 8;
  ctx.font = LABEL_FONT;
  ctx.fillStyle = colors.white;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  for (let ci = 0; ci < nCols; ci++) {
    const cx = leftMargin + ci * colWidth + colWidth / 2;
    ctx.save();
    ctx.translate(cx, headerBaseY);
    ctx.rotate(-Math.PI / 4);
    ctx.fillText(`Core ${ci}`, 0, 0);
    ctx.restore();
  }

  // ── Color scale legend ─────────────────────────────────────────────────────

  const legendX = leftMargin + colWidth * nCols + LEGEND_MARGIN;
  const legendY = topMargin;
  const legendH = gridHeight;
  const steps = 120;
  const stepH = legendH / steps;

  for (let i = 0; i < steps; i++) {
    const t = 1 - i / steps; // top = hot
    ctx.fillStyle = heatColor(t);
    ctx.fillRect(legendX, legendY + i * stepH, LEGEND_BAR_WIDTH, stepH + 1);
  }

  ctx.strokeStyle = colors.dark_grey;
  ctx.lineWidth = 1;
  ctx.strokeRect(legendX, legendY, LEGEND_BAR_WIDTH, legendH);

  ctx.font = SMALL_FONT;
  ctx.fillStyle = colors.white;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";

  const nLegendTicks = 5;
  for (let i = 0; i <= nLegendTicks; i++) {
    const t = 1 - i / nLegendTicks;
    const y2 = legendY + (i / nLegendTicks) * legendH;

    const label = options.normalize === "global"
      ? `${Math.round(globalMin + t * (globalMax - globalMin))} MHz`
      : `${(t * 100).toFixed(0)}%`;

    ctx.fillText(label, legendX + LEGEND_BAR_WIDTH + 5, y2);

    ctx.strokeStyle = colors.dark_grey;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(legendX + LEGEND_BAR_WIDTH, y2);
    ctx.lineTo(legendX + LEGEND_BAR_WIDTH + 4, y2);
    ctx.stroke();
  }

  ctx.textBaseline = "alphabetic";
}

