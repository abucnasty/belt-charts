import path from "path";
import { Chart } from "chart.js";
import { FontLibrary } from "skia-canvas";

export const FONT_FAMILY = "'Titillium Web', sans-serif";

// Resolves to <package root>/fonts from the bundled dist/index.js.
const FONTS_DIR = path.join(__dirname, "..", "fonts");

export function registerFonts(): void {
  FontLibrary.use("Titillium Web", [
    path.join(FONTS_DIR, "TitilliumWeb-Regular.ttf"),
    path.join(FONTS_DIR, "TitilliumWeb-Bold.ttf"),
  ]);
  Chart.defaults.font.family = FONT_FAMILY;
}
