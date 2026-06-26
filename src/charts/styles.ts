import { Canvas } from "skia-canvas";
import { MetricName } from "../data/Metric";
import { MetricEnum } from "../data/MetricEnum";
import { MetricRegistryInstance } from "../data/MetricRegistry";
import { colors, metricStyles, MetricStyle, PatternType, unfriendly_colors } from "./constants";

/**
 * Lighten a hex color by a specified amount
 * @param hex - The hex color string (e.g., "#0072B2")
 * @param amount - The amount to lighten (0-255)
 * @returns The lightened hex color string
 */
export function lightenColor(hex: string, amount: number): string {
  const num = parseInt(hex.slice(1), 16);
  let r = (num >> 16) + amount;
  let g = ((num >> 8) & 0x00ff) + amount;
  let b = (num & 0x0000ff) + amount;

  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

/**
 * Darken a hex color by a specified amount
 * @param hex - The hex color string (e.g., "#0072B2")
 * @param amount - The amount to darken (0-255)
 * @returns The darkened hex color string
 */
export function darkenColor(hex: string, amount: number): string {
  const num = parseInt(hex.slice(1), 16);
  let r = (num >> 16) - amount;
  let g = ((num >> 8) & 0x00ff) - amount;
  let b = (num & 0x0000ff) - amount;

  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));

  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

/**
 * Draw a pattern on a canvas context using skia-canvas (Node.js compatible)
 * Creates a solid colored background with black pattern overlay (matches chart background)
 * Returns a CanvasPattern that can be used as backgroundColor in Chart.js
 */
function drawPattern(
  patternType: PatternType,
  backgroundColor: string,
  patternColor: string = colors.black,
  size: number = 20
): CanvasPattern {
  const canvas = new Canvas(size, size);
  const ctx = canvas.getContext("2d");

  // Fill background with the metric's color
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, size, size);

  // Draw pattern in black (to match chart background)
  ctx.fillStyle = patternColor;
  ctx.strokeStyle = patternColor;
  ctx.lineWidth = 2;

  switch (patternType) {
    case "diagonal":
      ctx.beginPath();
      ctx.moveTo(0, size);
      ctx.lineTo(size, 0);
      ctx.moveTo(-size / 2, size / 2);
      ctx.lineTo(size / 2, -size / 2);
      ctx.moveTo(size / 2, size + size / 2);
      ctx.lineTo(size + size / 2, size / 2);
      ctx.stroke();
      break;

    case "diagonal-right-left":
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(size, size);
      ctx.moveTo(-size / 2, size / 2);
      ctx.lineTo(size / 2, size + size / 2);
      ctx.moveTo(size / 2, -size / 2);
      ctx.lineTo(size + size / 2, size / 2);
      ctx.stroke();
      break;

    case "dot":
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 6, 0, Math.PI * 2);
      ctx.fill();
      break;

    case "disc":
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 3, 0, Math.PI * 2);
      ctx.fill();
      break;

    case "ring":
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 3, 0, Math.PI * 2);
      ctx.stroke();
      break;

    case "cross":
      ctx.beginPath();
      ctx.moveTo(size / 4, size / 4);
      ctx.lineTo((size * 3) / 4, (size * 3) / 4);
      ctx.moveTo((size * 3) / 4, size / 4);
      ctx.lineTo(size / 4, (size * 3) / 4);
      ctx.stroke();
      break;

    case "plus":
      ctx.beginPath();
      ctx.moveTo(size / 2, size / 4);
      ctx.lineTo(size / 2, (size * 3) / 4);
      ctx.moveTo(size / 4, size / 2);
      ctx.lineTo((size * 3) / 4, size / 2);
      ctx.stroke();
      break;

    case "dash":
      ctx.beginPath();
      ctx.moveTo(size / 4, size / 2);
      ctx.lineTo((size * 3) / 4, size / 2);
      ctx.stroke();
      break;

    case "cross-dash":
      ctx.beginPath();
      ctx.moveTo(size / 4, size / 4);
      ctx.lineTo((size * 3) / 4, (size * 3) / 4);
      ctx.moveTo((size * 3) / 4, size / 4);
      ctx.lineTo(size / 4, (size * 3) / 4);
      ctx.moveTo(size / 4, size / 2);
      ctx.lineTo((size * 3) / 4, size / 2);
      ctx.stroke();
      break;

    case "dot-dash":
      ctx.beginPath();
      ctx.arc(size / 4, size / 2, size / 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(size / 2, size / 2);
      ctx.lineTo((size * 3) / 4, size / 2);
      ctx.stroke();
      break;

    case "line":
      ctx.beginPath();
      ctx.moveTo(0, size / 2);
      ctx.lineTo(size, size / 2);
      ctx.stroke();
      break;

    case "line-vertical":
      ctx.beginPath();
      ctx.moveTo(size / 2, 0);
      ctx.lineTo(size / 2, size);
      ctx.stroke();
      break;

    case "zigzag":
      ctx.beginPath();
      ctx.moveTo(0, (size * 3) / 4);
      ctx.lineTo(size / 4, size / 4);
      ctx.lineTo(size / 2, (size * 3) / 4);
      ctx.lineTo((size * 3) / 4, size / 4);
      ctx.lineTo(size, (size * 3) / 4);
      ctx.stroke();
      break;

    case "zigzag-vertical":
      ctx.beginPath();
      ctx.moveTo((size * 3) / 4, 0);
      ctx.lineTo(size / 4, size / 4);
      ctx.lineTo((size * 3) / 4, size / 2);
      ctx.lineTo(size / 4, (size * 3) / 4);
      ctx.lineTo((size * 3) / 4, size);
      ctx.stroke();
      break;

    case "weave":
      ctx.beginPath();
      ctx.moveTo(0, size / 2);
      ctx.lineTo(size / 2, 0);
      ctx.moveTo(size / 2, size);
      ctx.lineTo(size, size / 2);
      ctx.stroke();
      break;

    case "square":
      const squareSize = size / 3;
      ctx.fillRect(
        (size - squareSize) / 2,
        (size - squareSize) / 2,
        squareSize,
        squareSize
      );
      break;

    case "box":
      const boxSize = size / 2;
      ctx.strokeRect(
        (size - boxSize) / 2,
        (size - boxSize) / 2,
        boxSize,
        boxSize
      );
      break;

    case "triangle":
      ctx.beginPath();
      ctx.moveTo(size / 2, size / 4);
      ctx.lineTo((size * 3) / 4, (size * 3) / 4);
      ctx.lineTo(size / 4, (size * 3) / 4);
      ctx.closePath();
      ctx.fill();
      break;

    case "triangle-inverted":
      ctx.beginPath();
      ctx.moveTo(size / 2, (size * 3) / 4);
      ctx.lineTo((size * 3) / 4, size / 4);
      ctx.lineTo(size / 4, size / 4);
      ctx.closePath();
      ctx.fill();
      break;

    case "diamond":
      ctx.beginPath();
      ctx.moveTo(size / 2, size / 4);
      ctx.lineTo((size * 3) / 4, size / 2);
      ctx.lineTo(size / 2, (size * 3) / 4);
      ctx.lineTo(size / 4, size / 2);
      ctx.closePath();
      ctx.fill();
      break;

    case "diamond-box":
      ctx.beginPath();
      ctx.moveTo(size / 2, size / 4);
      ctx.lineTo((size * 3) / 4, size / 2);
      ctx.lineTo(size / 2, (size * 3) / 4);
      ctx.lineTo(size / 4, size / 2);
      ctx.closePath();
      ctx.stroke();
      break;

    case "assembling-machine": {
      // Subtle square outline — reflects the boxy shape of the assembling machine.
      const margin = size * 0.18;
      ctx.lineWidth = size * 0.08;
      ctx.strokeRect(margin, margin, size - margin * 2, size - margin * 2);
      break;
    }

    case "inserter": {
      // Factorio inserter silhouette: flat base at lower-right, diagonal arm to
      // upper-left, V-shaped pincer at the tip opening away from the arm.
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      const baseX = size * 0.76;
      const baseY = size * 0.80;
      const tipX  = size * 0.22;
      const tipY  = size * 0.20;

      // Flat mounting base (short horizontal stub)
      ctx.lineWidth = size * 0.16;
      ctx.beginPath();
      ctx.moveTo(baseX - size * 0.16, baseY);
      ctx.lineTo(baseX + size * 0.10, baseY);
      ctx.stroke();

      // Arm from base to tip
      ctx.lineWidth = size * 0.12;
      ctx.beginPath();
      ctx.moveTo(baseX, baseY - size * 0.06);
      ctx.lineTo(tipX, tipY);
      ctx.stroke();

      // Pincer: two prongs diverging forward from the tip
      // arm direction unit vector: (tipX-baseX, tipY-baseY) normalised ≈ (-0.707, -0.707)
      // perpendicular: (0.707, -0.707)
      const dx = -0.707;
      const dy = -0.707;
      const px =  0.707;
      const py = -0.707;
      const spread = size * 0.14;
      const reach  = size * 0.16;

      ctx.lineWidth = size * 0.10;
      // left prong
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(tipX + dx * reach - px * spread, tipY + dy * reach - py * spread);
      ctx.stroke();
      // right prong
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(tipX + dx * reach + px * spread, tipY + dy * reach + py * spread);
      ctx.stroke();
      break;
    }

    default:
      // Fallback: fill with solid color
      ctx.fillRect(0, 0, size, size);
  }

  return ctx.createPattern(canvas, "repeat") as CanvasPattern;
}

/**
 * FNV-1a 32-bit hash for stable mapping of metric names to indices.
 */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash >>> 0;
}

const DETERMINISTIC_PATTERNS: PatternType[] = [
  "diagonal",
  "diagonal-right-left",
  "dot",
  "disc",
  "ring",
  "cross",
  "plus",
  "dash",
  "cross-dash",
  "dot-dash",
  "line",
  "line-vertical",
  "weave",
  "zigzag",
  "zigzag-vertical",
  "square",
  "box",
  "triangle",
  "triangle-inverted",
  "diamond",
  "diamond-box",
];

let DETERMINISTIC_COLORS: string[] | null = null;
function getDeterministicColors(): string[] {
  if (!DETERMINISTIC_COLORS) {
    // Exclude the 4 pinned entity colors (blue, yellow, vermillion, orange) so
    // remaining entities get visually distinct colors from the named ones.
    // Start with the remaining CB-friendly colors, then supplement with
    // perceptually distinct extras.
    DETERMINISTIC_COLORS = [
      colors.green,           // #009E73
      colors.sky_blue,        // #56B4E9
      colors.reddish_purple,  // #CC79A7
      unfriendly_colors.teal,
      unfriendly_colors.lavender,
      unfriendly_colors.lime,
      unfriendly_colors.cyan,
      unfriendly_colors.coral,
      unfriendly_colors.indigo,
      unfriendly_colors.mint,
    ];
  }
  return DETERMINISTIC_COLORS;
}

/**
 * Compute a deterministic color for a metric name. Stable across runs, no patterns.
 */
export function getDeterministicEntityStyle(metricName: string): MetricStyle {
  const colorPalette = getDeterministicColors();
  const hash = fnv1a(metricName);
  const color = colorPalette[hash % colorPalette.length];
  return { color };
}

/**
 * Resolve the effective style for a metric: explicit entry > deterministic (entityUpdate children) > "other" fallback.
 */
function resolveMetricStyle(metricName: MetricName | string): MetricStyle {
  const explicit = metricStyles[metricName];
  if (explicit) {
    return explicit;
  }
  const registered = MetricRegistryInstance.get(metricName as MetricName);
  if (registered && (registered as { parent?: string }).parent === MetricEnum.ENTITY_UPDATE.name) {
    return getDeterministicEntityStyle(metricName);
  }
  return metricStyles["other"];
}

/**
 * Get the color for a metric
 * @param metricName - The metric name (e.g., "entityUpdate")
 * @returns The hex color string
 */
export function getMetricColor(metricName: MetricName | string): string {
  return resolveMetricStyle(metricName).color;
}

/**
 * Get the pattern type for a metric
 * @param metricName - The metric name (e.g., "entityUpdate")
 * @returns The pattern type string, or undefined if no pattern is set
 */
export function getMetricPatternType(
  metricName: MetricName | string
): PatternType | undefined {
  return resolveMetricStyle(metricName).pattern;
}

/**
 * Create a CanvasPattern for a metric using skia-canvas
 * @param metricName - The metric name (e.g., "entityUpdate")
 * @returns A CanvasPattern if the metric has a pattern defined, otherwise the solid color
 */
export function getMetricPattern(
  metricName: MetricName | string
): CanvasPattern | string {
  const style = resolveMetricStyle(metricName);
  if (style.pattern) {
    return drawPattern(style.pattern, style.color);
  }
  return style.color;
}

/**
 * Get background style for a metric - returns pattern or solid color
 * @param metricName - The metric name (e.g., "entityUpdate")
 * @param usePattern - Whether to return a pattern (true) or solid color (false)
 * @returns CanvasPattern or hex color string
 */
export function getMetricBackgroundColor(
  metricName: MetricName | string,
  usePattern: boolean = false
): CanvasPattern | string {
  if (usePattern) {
    return getMetricPattern(metricName);
  }
  return getMetricColor(metricName);
}
