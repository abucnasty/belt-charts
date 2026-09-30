/**
 * Shared Chart.js plugin definitions used across multiple chart types.
 */
import { colors } from "./constants";
import { FONT_FAMILY } from "./fonts";

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
