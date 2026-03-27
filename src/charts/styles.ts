import { Canvas } from "skia-canvas";
import { MetricName } from "../data/Metric";
import { colors, metricStyles, PatternType } from "./constants";

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

    default:
      // Fallback: fill with solid color
      ctx.fillRect(0, 0, size, size);
  }

  return ctx.createPattern(canvas, "repeat") as CanvasPattern;
}

/**
 * Get the color for a metric
 * @param metricName - The metric name (e.g., "entityUpdate")
 * @returns The hex color string
 */
export function getMetricColor(metricName: MetricName | string): string {
  return metricStyles[metricName]?.color ?? metricStyles["other"].color;
}

/**
 * Get the pattern type for a metric
 * @param metricName - The metric name (e.g., "entityUpdate")
 * @returns The pattern type string, or undefined if no pattern is set
 */
export function getMetricPatternType(
  metricName: MetricName | string
): PatternType | undefined {
  return metricStyles[metricName]?.pattern;
}

/**
 * Create a CanvasPattern for a metric using skia-canvas
 * @param metricName - The metric name (e.g., "entityUpdate")
 * @returns A CanvasPattern if the metric has a pattern defined, otherwise the solid color
 */
export function getMetricPattern(
  metricName: MetricName | string
): CanvasPattern | string {
  const style = metricStyles[metricName] ?? metricStyles["other"];
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
