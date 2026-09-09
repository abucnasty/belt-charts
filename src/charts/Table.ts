import { colors, chartLayout } from "./constants";

export interface TableRow {
  values: (string | number)[];
}

export interface TableData {
  header: string[];
  rows: TableRow[];
}

export interface TableRenderOptions {
  /**
   * Header label of the column that should absorb any leftover horizontal space and get
   * ellipsis-truncated (instead of squished) when space runs short — use this for the free-text
   * "Save File" column so long save names never force the other columns to overlap.
   */
  flexColumnHeader?: string;
}

const ROW_HEIGHT = chartLayout.TABLE_ROW_HEIGHT_PX;
const COLUMN_PADDING = chartLayout.TABLE_COLUMN_PADDING_PX;
const MIN_COLUMN_WIDTH_PX = chartLayout.TABLE_MIN_COLUMN_WIDTH_PX;
const MAX_HEADER_COLUMN_WIDTH_PX = chartLayout.TABLE_MAX_HEADER_COLUMN_WIDTH_PX;
const HEADER_LINE_HEIGHT_PX = chartLayout.TABLE_HEADER_LINE_HEIGHT_PX;
const MAX_HEADER_LINES = 2;
const HEADER_BLOCK_HEIGHT_PX = MAX_HEADER_LINES * HEADER_LINE_HEIGHT_PX;
const HEADER_FONT = "bold 12px Arial";
const ROW_FONT = "12px Arial";

/** Canvas height (px) needed to draw a table with `rowCount` data rows (plus its up-to-2-line header). */
export const tableReservedHeight = (rowCount: number): number =>
  HEADER_BLOCK_HEIGHT_PX + rowCount * ROW_HEIGHT + chartLayout.TABLE_BOTTOM_MARGIN_PX;

/** Rough average glyph width (px) for the 12px Arial table font; used only for pre-render width estimates. */
const AVG_CHAR_WIDTH_PX = 7;

/** Rough pre-render width estimate (px) for `text` at the table's font size; use for layout sizing before a canvas context exists. */
export const estimateTextWidth = (text: string): number => text.length * AVG_CHAR_WIDTH_PX;

/**
 * Estimates the canvas width (px) needed to show every column's header and data in full (no
 * truncation) — uses a character-count heuristic since no canvas context exists yet at layout
 * time. Use as a floor over the user-requested chart width; `createTableChartPlugin` only caps
 * header width and truncates at draw time if the actual canvas still ends up narrower than this.
 */
export const estimateTableWidth = (data: TableData): number =>
  data.header.reduce((sum, header, colIdx) => {
    const headerLen = header.length * AVG_CHAR_WIDTH_PX;
    const maxDataLen = data.rows.reduce((max, row) => Math.max(max, String(row.values[colIdx] ?? "").length * AVG_CHAR_WIDTH_PX), 0);
    return sum + Math.max(Math.max(headerLen, maxDataLen) + COLUMN_PADDING, MIN_COLUMN_WIDTH_PX);
  }, 0);

const truncateToWidth = (ctx: any, text: string, maxWidth: number): string => {
  // Small epsilon so a column sized exactly to its header/content (zero slack) doesn't get
  // spuriously truncated by float rounding when the same width is computed via a different
  // arithmetic path (e.g. width + padding - padding).
  const EPSILON_PX = 0.5;
  if (ctx.measureText(text).width <= maxWidth + EPSILON_PX) return text;
  const ellipsis = "…";
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(text.slice(0, mid) + ellipsis).width <= maxWidth) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return lo <= 0 ? ellipsis : text.slice(0, lo) + ellipsis;
};

/**
 * Wraps `text` onto up to 2 lines at a word boundary so it doesn't need to ellipsis-truncate
 * unless the second line still doesn't fit on its own.
 */
const wrapHeaderLines = (ctx: any, text: string, maxWidth: number): string[] => {
  if (ctx.measureText(text).width <= maxWidth + 0.5) return [text];

  const words = text.split(" ");
  let firstLine = "";
  let splitIdx = 0;
  for (; splitIdx < words.length; splitIdx++) {
    const candidate = firstLine ? `${firstLine} ${words[splitIdx]}` : words[splitIdx];
    if (ctx.measureText(candidate).width > maxWidth + 0.5 && firstLine) break;
    firstLine = candidate;
  }

  const secondLine = words.slice(splitIdx).join(" ");
  if (!secondLine) return [firstLine];
  return [firstLine, truncateToWidth(ctx, secondLine, maxWidth)];
};

/**
 * Chart.js plugin that draws `data` as a table anchored to the bottom of the canvas, one row per
 * entry (rather than one column per entry) so the table stays readable regardless of how many
 * save files are being compared — only the row count grows, and the canvas already auto-grows
 * vertically to fit.
 */
export const createTableChartPlugin = (data: TableData, options: TableRenderOptions = {}) => ({
  id: "valueTable",
  afterDraw: (chart: any) => {
    const { ctx, chartArea: { left, right }, height } = chart;
    ctx.save();

    // Baseline y for the last (bottom) header line; data rows start right below it.
    const tableTop = height - tableReservedHeight(data.rows.length) + HEADER_BLOCK_HEIGHT_PX;
    const availableWidth = right - left;
    const flexIdx = options.flexColumnHeader ? data.header.indexOf(options.flexColumnHeader) : -1;

    ctx.font = HEADER_FONT;
    // Full (uncapped) width each column needs to show its header and data in full.
    const measureNatural = (colIdx: number): number => {
      let maxWidth = ctx.measureText(data.header[colIdx]).width;
      data.rows.forEach(row => {
        maxWidth = Math.max(maxWidth, ctx.measureText(String(row.values[colIdx] ?? "")).width);
      });
      return maxWidth + COLUMN_PADDING;
    };

    const naturalWidths = data.header.map((_, colIdx) => Math.max(measureNatural(colIdx), MIN_COLUMN_WIDTH_PX));
    const totalNatural = naturalWidths.reduce((sum, w) => sum + w, 0);

    let columnWidths: number[];
    if (totalNatural <= availableWidth) {
      // Plenty of room: show every header/value in full and hand the leftover to the flex
      // column (or the last column, if there isn't one) instead of truncating anything.
      columnWidths = naturalWidths.slice();
      const growIdx = flexIdx >= 0 ? flexIdx : columnWidths.length - 1;
      columnWidths[growIdx] += availableWidth - totalNatural;
    } else if (flexIdx >= 0) {
      // Not enough room: a long metric-name header shouldn't be able to steal space from the
      // flex column — cap its contribution and let it ellipsis-truncate instead (data cells,
      // which are short numbers/percentages, are never capped).
      const cappedWidths = naturalWidths.map((w, i) => (i === flexIdx ? w : Math.min(w, MAX_HEADER_COLUMN_WIDTH_PX)));
      const fixedTotal = cappedWidths.reduce((sum, w, i) => sum + (i === flexIdx ? 0 : w), 0);
      const flexWidth = Math.max(availableWidth - fixedTotal, MIN_COLUMN_WIDTH_PX);
      const totalWidth = fixedTotal + flexWidth;
      const scale = totalWidth > availableWidth ? availableWidth / totalWidth : 1;
      columnWidths = cappedWidths.map((w, i) => (i === flexIdx ? flexWidth : w) * scale);
    } else {
      const scale = availableWidth / totalNatural;
      columnWidths = naturalWidths.map(w => w * scale);
    }

    const columnPositions = [left];
    for (let i = 0; i < columnWidths.length - 1; i++) {
      columnPositions.push(columnPositions[i] + columnWidths[i]);
    }

    // Zebra striping so rows stay distinguishable once there are many save files.
    ctx.fillStyle = colors.dark_grey;
    ctx.globalAlpha = 0.2;
    data.rows.forEach((_, rowIdx) => {
      if (rowIdx % 2 === 1) {
        ctx.fillRect(left, tableTop + rowIdx * ROW_HEIGHT + ROW_HEIGHT * 0.3, availableWidth, ROW_HEIGHT);
      }
    });
    ctx.globalAlpha = 1;

    const drawLine = (text: string, colIdx: number, y: number, bold: boolean) => {
      ctx.font = bold ? HEADER_FONT : ROW_FONT;
      ctx.fillStyle = colors.white;
      const cellWidth = columnWidths[colIdx] - COLUMN_PADDING;
      if (colIdx === flexIdx) {
        ctx.textAlign = "left";
        ctx.fillText(truncateToWidth(ctx, text, cellWidth), columnPositions[colIdx] + COLUMN_PADDING / 2, y);
      } else {
        ctx.textAlign = "center";
        ctx.fillText(truncateToWidth(ctx, text, cellWidth), columnPositions[colIdx] + columnWidths[colIdx] / 2, y);
      }
    };

    ctx.font = HEADER_FONT;
    data.header.forEach((text, colIdx) => {
      const cellWidth = columnWidths[colIdx] - COLUMN_PADDING;
      const lines = wrapHeaderLines(ctx, text, cellWidth);
      // Bottom-align so the last line always sits right above the data rows, whether a header
      // wrapped to 2 lines or not.
      lines.forEach((line, lineIdx) => {
        const y = tableTop - (lines.length - 1 - lineIdx) * HEADER_LINE_HEIGHT_PX;
        drawLine(line, colIdx, y, true);
      });
    });
    data.rows.forEach((row, rowIdx) => {
      const y = tableTop + (rowIdx + 1) * ROW_HEIGHT;
      row.values.forEach((value, colIdx) => drawLine(String(value), colIdx, y, false));
    });

    ctx.restore();
  },
});
