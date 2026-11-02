/**
 * Shared Chart.js plugin definitions used across multiple chart types.
 */
import { colors } from "./constants";
import { FONT_FAMILY } from "./fonts";
import { anchorPatternToRect } from "./styles";
import type { ErrorBar } from "../data/errorBars";

// Originally attempted to just use chartjs-plugin-datalabels: that plugin has a known position bug in skia-canvas
// https://github.com/chartjs/chartjs-plugin-datalabels/issues/416
export const valueLabelsPlugin = {
  id: "valueLabels",
  afterDatasetsDraw(chart: any) {
    const { ctx } = chart;
    ctx.save();
    ctx.font = `bold 12px ${FONT_FAMILY}`;
    ctx.fillStyle = colors.white;
    ctx.strokeStyle = colors.black;
    ctx.lineWidth = 1;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    chart.data.datasets.forEach((dataset: any, datasetIndex: number) => {
      const meta = chart.getDatasetMeta(datasetIndex);
      if (meta.hidden) return;
      meta.data.forEach((element: any, index: number) => {
        const value = dataset.data[index];
        if (typeof value !== "number" || Math.round(value) === 0) return;

        const { x, y, base } = element.getProps(["x", "y", "base"], true);
        const left = Math.min(x, base);
        const width = Math.abs(x - base);
        const text = Math.round(value).toString();
        // Skip segments too thin to legibly fit the label rather than letting it spill into neighbors.
        if (ctx.measureText(text).width + 6 > width) return;

        const centerX = left + width / 2;
        ctx.strokeText(text, centerX, y);
        ctx.fillText(text, centerX, y);
      });
    });

    ctx.restore();
  },
};

/**
 * Draws a horizontal error bar at the end of each row's bar. `barsByRow` is indexed by chart row
 * (category) and holds the interval in x-axis units, or null for rows without one (group headers).
 * Drawn black-outlined white so it stays visible on every segment color.
 */
export const createErrorBarsPlugin = (barsByRow: (ErrorBar | null)[]) => ({
  id: "errorBars",
  afterDatasetsDraw(chart: any) {
    const { ctx, scales } = chart;
    const meta = chart.getDatasetMeta(0);
    const capHalf = 6;
    ctx.save();
    ctx.lineCap = "butt";
    const draw = (width: number, color: string, y: number, x1: number, x2: number) => {
      ctx.lineWidth = width;
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(x1, y);
      ctx.lineTo(x2, y);
      ctx.moveTo(x1, y - capHalf);
      ctx.lineTo(x1, y + capHalf);
      ctx.moveTo(x2, y - capHalf);
      ctx.lineTo(x2, y + capHalf);
      ctx.stroke();
    };
    barsByRow.forEach((bar, index) => {
      const element = meta.data[index];
      if (!bar || !element) return;
      const y = element.getProps(["y"], true).y;
      const x1 = scales.x.getPixelForValue(bar.lower);
      const x2 = scales.x.getPixelForValue(bar.upper);
      draw(4, colors.black, y, x1, x2);
      draw(2, colors.white, y, x1, x2);
    });
    ctx.restore();
  },
});

/**
 * Re-anchors pattern fills (see `anchorPatternToRect`) to each bar and legend swatch so every
 * shape shows the same, centered crop of the pattern instead of an arbitrary canvas-origin crop.
 */
export const patternAnchorPlugin = {
  id: "patternAnchor",
  beforeDraw(chart: any) {
    const legend = chart.legend;
    if (!legend?.options?.display || !legend.legendItems) return;
    const labels = legend.options.labels;
    const fontSize = labels.font?.size ?? 12;
    const boxWidth = labels.boxWidth || fontSize;
    const boxHeight = labels.boxHeight || fontSize;
    legend.legendItems.forEach((item: any, i: number) => {
      const hitBox = legend.legendHitBoxes?.[i];
      if (!hitBox) return;
      // Mirrors chart.js's legend swatch placement (drawLegendBox).
      const top = hitBox.top + Math.max((fontSize - boxHeight) / 2, 0);
      item.fillStyle = anchorPatternToRect(item.fillStyle, hitBox.left, top, boxWidth, boxHeight);
    });
  },
  beforeDatasetsDraw(chart: any) {
    chart.data.datasets.forEach((_: any, datasetIndex: number) => {
      const meta = chart.getDatasetMeta(datasetIndex);
      if (meta.hidden || meta.type !== "bar") return;
      meta.data.forEach((element: any) => {
        const fill = element.options?.backgroundColor;
        if (fill === null || typeof fill !== "object") return;
        const { x, y, base, width, height, horizontal } =
          element.getProps(["x", "y", "base", "width", "height", "horizontal"], true);
        const rect = horizontal
          ? { left: Math.min(x, base), top: y - height / 2, width: Math.abs(x - base), height }
          : { left: x - width / 2, top: Math.min(y, base), width, height: Math.abs(y - base) };
        // Resolved options may be frozen/shared across elements, so replace rather than mutate.
        element.options = {
          ...element.options,
          backgroundColor: anchorPatternToRect(fill, rect.left, rect.top, rect.width, rect.height),
        };
      });
    });
  },
};

/** Fills the chart canvas with a black background before drawing. */
export const backgroundPlugin = {
    id: "customBackground",
    beforeDraw: (chart: any) => {
        const { ctx, width, height } = chart;
        ctx.save();
        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
    },
};
