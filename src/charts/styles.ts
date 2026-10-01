import { Canvas } from "skia-canvas";
import { MetricName } from "../data/Metric";
import { MetricEnum } from "../data/MetricEnum";
import { colors, metricStyles, MetricStyle, PatternType } from "./constants";

let inserterEasterEggEnabled = false;

export function enableInserterEasterEgg(): void {
  inserterEasterEggEnabled = true;
}

/** Edge length (px) of one repeating pattern tile. */
export const PATTERN_TILE_SIZE = 20;

/**
 * Draw one repeating pattern tile using skia-canvas (Node.js compatible): a solid
 * colored background with a black motif overlay (matches chart background).
 */
export function drawPatternTile(
  patternType: PatternType,
  backgroundColor: string,
  patternColor: string = colors.black,
  size: number = PATTERN_TILE_SIZE
): Canvas {
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
      // Crosshatch: both diagonal directions.
      ctx.beginPath();
      ctx.moveTo(0, size);
      ctx.lineTo(size, 0);
      ctx.moveTo(-size / 2, size / 2);
      ctx.lineTo(size / 2, -size / 2);
      ctx.moveTo(size / 2, size + size / 2);
      ctx.lineTo(size + size / 2, size / 2);
      ctx.moveTo(0, 0);
      ctx.lineTo(size, size);
      ctx.moveTo(-size / 2, size / 2);
      ctx.lineTo(size / 2, size + size / 2);
      ctx.moveTo(size / 2, -size / 2);
      ctx.lineTo(size + size / 2, size / 2);
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
      ctx.lineJoin = "round";

      const baseX = size * 0.76;
      const baseY = size * 0.80;
      const tipX  = size * 0.22;
      const tipY  = size * 0.20;

      // Rectangular mounting base (filled rect)
      const bw = size * 0.30;
      const bh = size * 0.14;
      ctx.fillRect(baseX - bw * 0.55, baseY - bh * 0.5, bw, bh);

      // Arm from base to tip
      ctx.lineCap = "round";
      ctx.lineWidth = size * 0.12;
      ctx.beginPath();
      ctx.moveTo(baseX, baseY - size * 0.06);
      ctx.lineTo(tipX, tipY);
      ctx.stroke();

      // Pincer
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

  return canvas;
}

// Remembers the source tile of every pattern we hand out so it can be re-anchored per shape.
const patternTiles = new WeakMap<object, Canvas>();

function createTilePattern(tile: Canvas, offsetX: number = 0, offsetY: number = 0): CanvasPattern {
  const pattern = tile.getContext("2d").createPattern(tile, "repeat") as unknown as CanvasPattern;
  if (offsetX !== 0 || offsetY !== 0) {
    (pattern as any).setTransform(1, 0, 0, 1, offsetX, offsetY);
  }
  patternTiles.set(pattern, tile);
  return pattern;
}

/**
 * Canvas patterns repeat from the canvas origin, so the same pattern shows a different crop
 * in every bar/legend swatch. Returns a copy of `fill` whose tile grid is centered inside the
 * given rect (whole tiles in the middle, equal partial tiles at each edge). Non-pattern fills
 * (plain colors) are returned unchanged.
 */
export function anchorPatternToRect(
  fill: unknown,
  left: number,
  top: number,
  width: number,
  height: number
): unknown {
  if (fill === null || typeof fill !== "object") return fill;
  const tile = patternTiles.get(fill);
  if (!tile) return fill;
  // Shapes narrower than one tile get the tile centered on them so the motif stays visible.
  const centeredOffset = (extent: number, tileExtent: number) =>
    (extent - Math.max(Math.floor(extent / tileExtent), 1) * tileExtent) / 2;
  const offsetX = left + centeredOffset(Math.abs(width), tile.width);
  const offsetY = top + centeredOffset(Math.abs(height), tile.height);
  return createTilePattern(tile, offsetX, offsetY);
}

/**
 * Resolve the effective style for a metric: explicit entry > "other" fallback.
 */
function resolveMetricStyle(metricName: MetricName | string): MetricStyle {
  const explicit = metricStyles[metricName];
  if (explicit) {
    if (inserterEasterEggEnabled && metricName === MetricEnum.INSERTER.name) {
      return { ...explicit, pattern: "inserter" as const };
    }
    return explicit;
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
    return createTilePattern(drawPatternTile(style.pattern, style.color));
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
