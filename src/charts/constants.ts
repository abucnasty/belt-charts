import { MetricEnum } from "../data/MetricEnum";
import { darkenColor, lightenColor } from "./styles";

/**
 * Colorblind-friendly color palette
 * @see https://davidmathlogic.com/colorblind/
 * Dark colors optimized for visibility on black backgrounds
 */
export const colors = {
  blue: "#0072B2",
  orange: "#E69F00",
  yellow: "#F0E442",
  green: "#009E73",
  sky_blue: "#56B4E9",
  vermillion: "#D55E00",
  reddish_purple: "#CC79A7",
  dark_grey: "#585858",
  white: "#FFFFFF",
  black: "#000000",
} as const;

export type ColorKey = keyof typeof colors;

/**
 * Extended colors that do not conform to the colorblind-friendly palette.
 * Use only in conjunction with a pattern to ensure they are distinguishable for all users.
 */
export const unfriendly_colors = {
  // Orange variants
  orange_light: lightenColor(colors.orange, 40),
  orange_dark: darkenColor(colors.orange, 40),

  // Reds
  red: "#E63946",
  crimson: "#DC143C",
  coral: "#FF7F50",

  // Purples
  purple: "#9B59B6",
  violet: "#8A2BE2",
  lavender: "#B57EDC",
  indigo: "#6366F1",

  // Pinks
  magenta: "#E91E8B",
  hot_pink: "#FF69B4",
  rose: "#F472B6",

  // Greens
  lime: "#84CC16",
  emerald: "#10B981",
  mint: "#4ADE80",
  forest: "#228B22",

  // Blues
  royal_blue: "#4169E1",
  cyan: "#06B6D4",
  teal: "#14B8A6",
  navy_light: "#5B7FD1",

  // Yellows/Golds
  gold: "#FFD700",
  amber: "#F59E0B",
  peach: "#FBBF77",

  // Earth tones
  bronze: "#CD7F32",
  rust: "#B7410E",
  sienna: "#D68650",
} as const;

/**
 * Available pattern types for chart backgrounds
 * Implemented for Node.js/skia-canvas (no browser document required)
 */
export type PatternType =
  | "plus"
  | "cross"
  | "dash"
  | "cross-dash"
  | "dot"
  | "dot-dash"
  | "disc"
  | "ring"
  | "line"
  | "line-vertical"
  | "weave"
  | "zigzag"
  | "zigzag-vertical"
  | "diagonal"
  | "diagonal-right-left"
  | "square"
  | "box"
  | "triangle"
  | "triangle-inverted"
  | "diamond"
  | "diamond-box";

/**
 * Style configuration for a metric, combining color and optional pattern
 */
export interface MetricStyle {
  color: string;
  pattern?: PatternType;
}

/**
 * Centralized metric styling - single source of truth for colors and patterns
 * Each metric has a fixed color, patterns are opt-in per metric
 */
export const metricStyles: Record<string, MetricStyle> = {
  [MetricEnum.ENTITY_UPDATE.name]: { color: colors.blue },
  [MetricEnum.TRAINS.name]: { color: colors.yellow },
  [MetricEnum.CONTROL_BEHAVIOR_UPDATE.name]: { color: colors.reddish_purple },
  [MetricEnum.TRANSPORT_LINES_UPDATE.name]: { color: colors.green },
  [MetricEnum.ELECTRIC_HEAT_FLUID_CIRCUIT_UPDATE.name]: { color: colors.orange },
  [MetricEnum.SPACE_PLATFORMS.name]: { color: colors.vermillion },
  [MetricEnum.PARTICLE_UPDATE.name]: { color: colors.sky_blue },
  [MetricEnum.ELECTRIC_NETWORK_UPDATE.name]: {
    color: unfriendly_colors.orange_light,
    pattern: "diagonal-right-left",
  },
  [MetricEnum.FLUID_FLOW_UPDATE.name]: {
    color: unfriendly_colors.orange_dark,
    pattern: "diagonal",
  },
  [MetricEnum.HEAT_NETWORK_UPDATE.name]: {
    color: unfriendly_colors.red,
    pattern: "ring",
  },
  // Catch-all for metrics not explicitly styled
  other: { color: colors.dark_grey },
};