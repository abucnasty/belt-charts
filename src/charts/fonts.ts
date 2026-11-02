import path from "path";
import { Chart } from "chart.js";
import { FontLibrary } from "skia-canvas";
import { scaled } from "./fontScale";

export { scaled, getFontScale, setFontScale } from "./fontScale";

// Titillium Web is the font used on factorio.com.
export const FONT_FAMILY = "'Titillium Web', sans-serif";

// Resolves to <package root>/fonts from the bundled dist/index.js.
const FONTS_DIR = path.join(__dirname, "..", "fonts");

/** A canvas font string at `px` (before scaling) in the chart font. */
export function font(px: number, bold = false): string {
  return `${bold ? "bold " : ""}${scaled(px)}px ${FONT_FAMILY}`;
}

export function registerFonts(): void {
  FontLibrary.use("Titillium Web", [
    path.join(FONTS_DIR, "TitilliumWeb-Regular.ttf"),
    path.join(FONTS_DIR, "TitilliumWeb-Bold.ttf"),
  ]);
  Chart.defaults.font.family = FONT_FAMILY;
}
