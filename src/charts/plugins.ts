/**
 * Shared Chart.js plugin definitions used across multiple chart types.
 */

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
