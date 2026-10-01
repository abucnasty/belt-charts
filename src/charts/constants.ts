import { CategoryMetricEnum, EntityMetricEnum, MetricEnum } from "../data/MetricEnum";
import { darkenColor, lightenColor } from "./colorUtils";

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
 * Extra entity hues, mostly from Paul Tol's light/bright schemes (https://sronpersonalpages.nl/~pault/),
 * picked for the largest CIELAB distance from `colors` in normal, green-blind and red-blind vision
 * while staying light enough to contrast with the black background and black pattern overlay.
 */
export const extra_colors = {
  light_yellow: "#EEDD88",
  indigo: "#6366F1",
  red: "#EE6677",
  mint: "#44BB99",
  pink: "#FFAABB",
  light_cyan: "#99DDFF",
  pale_grey: "#DDDDDD",
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
  | "stripe-horizontal"
  | "stripe-vertical"
  | "grid"
  | "grid-diagonal"
  | "brick"
  | "wave"
  | "zigzag"
  | "zigzag-vertical"
  | "diagonal"
  | "diagonal-wide"
  | "diagonal-right-left"
  | "square"
  | "box"
  | "triangle"
  | "triangle-inverted"
  | "diamond"
  | "diamond-box"
  | "inserter"
  | "assembling-machine";

/**
 * Style configuration for a metric, combining color and optional pattern
 */
export interface MetricStyle {
  color: string;
  pattern?: PatternType;
}

/**
 * Every entity type gets a unique (color, pattern) pair so no two entities ever render alike.
 * Rows are tiers ordered by how often the entity shows up in benchmarks: the most common get
 * solid colorblind-friendly colors, later tiers add a pattern (clearest patterns first). Extra hues
 * always carry a pattern. Typed by enum key so a newly added entity fails to compile until styled.
 * Each pattern belongs to ONE color family (colorblind-friendly vs extra hues) so any two entities
 * sharing a pattern differ by a colorblind-distinct hue.
 */
const entityStyles: Record<keyof typeof EntityMetricEnum, MetricStyle> = {
  INSERTER: { color: colors.yellow },
  ASSEMBLING_MACHINE: { color: colors.blue },
  MINING_DRILL: { color: colors.vermillion },
  FURNACE: { color: colors.orange },
  PUMP: { color: colors.green },
  LOADER: { color: colors.sky_blue },
  LAB: { color: colors.reddish_purple },

  INFINITY_CONTAINER: { color: extra_colors.light_yellow, pattern: "diagonal" },
  INFINITY_PIPE: { color: extra_colors.indigo, pattern: "diagonal" },
  ELECTRIC_ENERGY_INTERFACE: { color: extra_colors.red, pattern: "diagonal" },
  ROBOPORT: { color: extra_colors.mint, pattern: "diagonal" },
  LOGISTIC_ROBOT: { color: extra_colors.pink, pattern: "diagonal" },
  CONSTRUCTION_ROBOT: { color: extra_colors.light_cyan, pattern: "diagonal" },
  BOILER: { color: extra_colors.pale_grey, pattern: "diagonal" },

  GENERATOR: { color: colors.yellow, pattern: "dot" },
  REACTOR: { color: colors.blue, pattern: "dot" },
  TURRET: { color: colors.vermillion, pattern: "dot" },
  ROCKET_SILO: { color: colors.orange, pattern: "dot" },
  CHARACTER: { color: colors.green, pattern: "dot" },
  CAR: { color: colors.sky_blue, pattern: "dot" },
  RADAR: { color: colors.reddish_purple, pattern: "dot" },

  EXPLOSION: { color: extra_colors.light_yellow, pattern: "grid" },
  OFFSHORE_PUMP: { color: extra_colors.indigo, pattern: "grid" },
  VALVE: { color: extra_colors.red, pattern: "grid" },
  CARGO_WAGON: { color: extra_colors.mint, pattern: "grid" },
  LOCOMOTIVE: { color: extra_colors.pink, pattern: "grid" },
  FLUID_WAGON: { color: extra_colors.light_cyan, pattern: "grid" },
  BURNER_GENERATOR: { color: extra_colors.pale_grey, pattern: "grid" },

  AGRICULTURAL_TOWER: { color: colors.green, pattern: "stripe-horizontal" },
  ASTEROID_COLLECTOR: { color: colors.blue, pattern: "stripe-horizontal" },
  THRUSTER: { color: colors.vermillion, pattern: "stripe-horizontal" },
  FUSION_REACTOR: { color: colors.orange, pattern: "stripe-horizontal" },
  FUSION_GENERATOR: { color: colors.yellow, pattern: "stripe-horizontal" },
  CARGO_POD: { color: colors.sky_blue, pattern: "stripe-horizontal" },
  HEAT_INTERFACE: { color: colors.reddish_purple, pattern: "stripe-horizontal" },

  ROCKET_SILO_ROCKET: { color: extra_colors.light_yellow, pattern: "grid-diagonal" },
  ASTEROID: { color: extra_colors.indigo, pattern: "grid-diagonal" },
  PROJECTILE: { color: extra_colors.red, pattern: "grid-diagonal" },
  BEAM: { color: extra_colors.mint, pattern: "grid-diagonal" },
  POWER_SWITCH: { color: extra_colors.pink, pattern: "grid-diagonal" },
  GATE: { color: extra_colors.light_cyan, pattern: "grid-diagonal" },
  SPIDER_VEHICLE: { color: extra_colors.pale_grey, pattern: "grid-diagonal" },

  COMBAT_ROBOT: { color: colors.yellow, pattern: "ring" },
  CAPTURE_ROBOT: { color: colors.blue, pattern: "ring" },
  ARTILLERY_TURRET: { color: colors.vermillion, pattern: "ring" },
  ARTILLERY_WAGON: { color: colors.orange, pattern: "ring" },
  ARTILLERY_PROJECTILE: { color: colors.green, pattern: "ring" },
  ARTILLERY_FLARE: { color: colors.sky_blue, pattern: "ring" },
  FLUID_TURRET: { color: colors.reddish_purple, pattern: "ring" },

  FLUID_STREAM: { color: extra_colors.light_yellow, pattern: "brick" },
  LAND_MINE: { color: extra_colors.indigo, pattern: "brick" },
  ENEMY_SPAWNER: { color: extra_colors.red, pattern: "brick" },
  UNIT: { color: extra_colors.pale_grey, pattern: "brick" },
  SPIDER_UNIT: { color: extra_colors.pink, pattern: "brick" },
  INFINITY_CARGO_WAGON: { color: extra_colors.light_cyan, pattern: "brick" },
  OLD_AGRICULTURAL_TOWER: { color: extra_colors.mint, pattern: "brick" },

  ITEM_REQUEST_PROXY: { color: colors.yellow, pattern: "zigzag" },
  TEMPORARY_CONTAINER: { color: colors.blue, pattern: "zigzag" },
  CHARACTER_CORPSE: { color: colors.vermillion, pattern: "zigzag" },
  CORPSE: { color: colors.orange, pattern: "zigzag" },
  STICKER: { color: colors.green, pattern: "zigzag" },
  SMOKE_WITH_TRIGGER: { color: colors.sky_blue, pattern: "zigzag" },
  PARTICLE_SOURCE: { color: colors.reddish_purple, pattern: "zigzag" },

  FLAME_THROWER_EXPLOSION: { color: extra_colors.light_yellow, pattern: "wave" },
  FLYING_TEXT_ENTITY: { color: extra_colors.indigo, pattern: "wave" },
  HIGHLIGHT_BOX_ENTITY: { color: extra_colors.red, pattern: "wave" },
  SPEECH_BUBBLE: { color: extra_colors.mint, pattern: "wave" },
  PROGRAMMABLE_SPEAKER: { color: extra_colors.pink, pattern: "wave" },
};

/**
 * Centralized metric styling - single source of truth for colors and patterns
 * Each metric has a fixed color, patterns are opt-in per metric
 */
export const metricStyles: Record<string, MetricStyle> = {
  ...Object.fromEntries(
    Object.entries(entityStyles).map(([key, style]) => [EntityMetricEnum[key as keyof typeof EntityMetricEnum].name, style])
  ),
  [CategoryMetricEnum.ENTITY_UPDATE.name]: { color: colors.blue },
  [CategoryMetricEnum.TRAINS.name]: { color: colors.yellow },
  [CategoryMetricEnum.CONTROL_BEHAVIOR_UPDATE.name]: { color: colors.reddish_purple },
  [CategoryMetricEnum.TRANSPORT_LINES_UPDATE.name]: { color: colors.green },
  [CategoryMetricEnum.ELECTRIC_HEAT_FLUID_CIRCUIT_UPDATE.name]: { color: colors.orange },
  [CategoryMetricEnum.SPACE_PLATFORMS.name]: { color: colors.vermillion },
  [CategoryMetricEnum.PARTICLE_UPDATE.name]: { color: colors.sky_blue },
  [CategoryMetricEnum.ELECTRIC_NETWORK_UPDATE.name]: {
    color: unfriendly_colors.orange_light,
    pattern: "diagonal-right-left",
  },
  [CategoryMetricEnum.FLUID_FLOW_UPDATE.name]: {
    color: unfriendly_colors.orange_dark,
    pattern: "diagonal",
  },
  [CategoryMetricEnum.HEAT_NETWORK_UPDATE.name]: {
    color: unfriendly_colors.red,
    pattern: "ring",
  },
  [CategoryMetricEnum.POLLUTION_UPDATE.name]: { 
    color: unfriendly_colors.rust,
    pattern: "dot",
  },
  // Catch-all for metrics not explicitly styled
  other: { color: colors.dark_grey },
};

/**
 * Numeric layout constants shared across chart rendering.
 * Change these here rather than hunting for bare numbers in chart files.
 */
export const chartLayout = {
  /** Factorio game ticks per real-world second. */
  TICKS_PER_SECOND: 60,
  /** Height of each row in the in-chart summary table (px). */
  TABLE_ROW_HEIGHT_PX: 20,
  /** Height of a single wrapped header line in the summary table (px); headers reserve up to 2 of these before falling back to ellipsis-truncation. */
  TABLE_HEADER_LINE_HEIGHT_PX: 14,
  /** Horizontal padding added to each column in the summary table (px). */
  TABLE_COLUMN_PADDING_PX: 16,
  /** Extra bottom margin below the summary table rows (px). */
  TABLE_BOTTOM_MARGIN_PX: 10,
  /** Floor width for any summary-table column (px); prevents a column from fully collapsing when space is tight. */
  TABLE_MIN_COLUMN_WIDTH_PX: 64,
  /** Ceiling width a non-flex summary-table column's header text may claim (px); longer headers get ellipsis-truncated instead of squeezing the flex column. */
  TABLE_MAX_HEADER_COLUMN_WIDTH_PX: 120,
  /** Left inset (px) for the flex column when it's drawn in the blank strip under the y-axis tick labels, instead of inside the plot area. */
  TABLE_LEFT_MARGIN_PX: 8,
  /** Extra horizontal chrome (px) reserved outside the plot area (bar chart y-axis tick labels, margins) when estimating minimum canvas width for a chart with a table. */
  TABLE_WIDTH_CHROME_PX: 60,
  /** Scale multiplier applied below the dataset minimum for Y-axis lower bound. */
  AXIS_SCALE_LOWER_PADDING: 0.9,
  /** Scale multiplier applied above the dataset maximum for Y-axis upper bound. */
  AXIS_SCALE_UPPER_PADDING: 1.1,
  /** Minimum height of a single bar/spacer row in horizontal bar charts (px); used to auto-grow canvas height for many rows. */
  MIN_BAR_ROW_HEIGHT_PX: 26,
  /** Fixed vertical space reserved for title/legend/x-axis chrome in horizontal bar charts (px). */
  BAR_CHART_CHROME_HEIGHT_PX: 140,
  /** Minimum width of a single category column in box-plot charts (px); used to auto-grow canvas width for many categories. */
  MIN_BOX_COLUMN_WIDTH_PX: 70,
  /** Fixed horizontal space reserved for title/y-axis-label chrome in box-plot charts (px). */
  BOX_CHART_CHROME_WIDTH_PX: 140,
} as const;