import { Chart } from "chart.js";

/**
 * The `--font-scale` factor: text sizes and the layout measures that exist to fit text (table row
 * height, minimum bar row height, ...) are multiplied by it. Kept apart from fonts.ts, which loads
 * the native canvas library, so command code can set it without pulling that in.
 */
let fontScale = 1;

/** Chart.js default text size (px) at a font scale of 1. */
const CHART_JS_DEFAULT_FONT_SIZE = 12;

export function getFontScale(): number {
  return fontScale;
}

/**
 * Sets the `--font-scale` factor for the charts rendered from now on: Chart.js text (axis ticks,
 * legend, axis titles) follows its default font size, and chart code scales its explicit sizes
 * with `scaled()` / `font()`.
 */
export function setFontScale(scale: number): void {
  fontScale = scale;
  Chart.defaults.font.size = CHART_JS_DEFAULT_FONT_SIZE * scale;
}

/** A pixel size multiplied by the current font scale. */
export function scaled(px: number): number {
  return px * fontScale;
}
