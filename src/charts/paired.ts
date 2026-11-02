import { Chart } from "chart.js";
import type { RowSort } from "../commands/types";
import { formatPercentChange, formatSigned } from "../data/baseline";
import { groupLabel } from "../data/groupBy";
import { UserError } from "../utils";
import { colors } from "./constants";
import { font } from "./fonts";
import { rowComparator } from "./rowOrder";

/** Colors of the sessions in a single-bar paired chart (UPS), in input order. */
export const SESSION_COLORS = [colors.blue, colors.orange, colors.green, colors.vermillion, colors.reddish_purple, colors.sky_blue];

/** One result of one session: its label without the session suffix, and what to draw. */
export type PairedItem = {
  /** Row label shared by the sessions of a save: the displayed label without the ` (suffix)`. */
  label: string;
  session: string;
  group?: string;
  /** Plotted total of the bar (µs, or UPS on a UPS chart). */
  total: number;
  /** Plotted value of each stacked segment, by segment name. */
  segments: Map<string, number>;
};

export type PairedSegment = { name: string; description: string };

export type PairedOptions = {
  /** Session suffixes in input order; one bar per session in every row. */
  sessions: string[];
  groupBy: string[];
  /** Heading per group key for the group headers and the table's Group column; a key without one is shown as itself. */
  groupLabels?: Map<string, string>;
  sort: RowSort;
  /** One bar per session (UPS or wholeUpdate only) instead of stacked segments. */
  singleBar: boolean;
  /** True when a larger total is better (UPS), so `total` ranks the largest first. */
  higherIsBetter?: boolean;
  /** Decimal places of the totals in the table. */
  digits: number;
  /** Header of the total in the table, e.g. "Whole" or "UPS". */
  totalLabel: string;
  spacerPrefix: string;
};

export type PairedDataset = {
  label: string;
  /** Chart.js stack group: bars of one session stack together and sit beside the other sessions'. */
  stack: string;
  session: string;
  /** Segment this dataset draws; null for a single-bar session total. */
  segmentName: string | null;
  data: (number | null)[];
};

export type PairedLayout = {
  labels: string[];
  datasets: PairedDataset[];
  table: { header: string[]; rows: (string | number)[][] };
  /** Number of chart rows (saves plus group headers). */
  rowCount: number;
};

/** The row label of a result: its displayed label minus the ` (suffix)` its input added. */
export function pairLabelOf(result: { displayName: string; inputSuffix?: string }): string {
  const tail = result.inputSuffix ? ` (${result.inputSuffix})` : "";
  return tail && result.displayName.endsWith(tail) ? result.displayName.slice(0, -tail.length) : result.displayName;
}

/** The sessions of a paired chart, in input order; throws when fewer than two inputs carry a suffix. */
export function sessionsOf(results: { inputSuffix?: string }[]): string[] {
  const sessions: string[] = [];
  for (const result of results) {
    if (result.inputSuffix === undefined) {
      throw new UserError("--paired needs every input to have a label suffix: --input \"<glob>:<suffix>\"");
    }
    if (!sessions.includes(result.inputSuffix)) sessions.push(result.inputSuffix);
  }
  if (sessions.length < 2) {
    throw new UserError("--paired needs at least two inputs with different label suffixes, e.g. --input \"a/*.csv:malloc\" --input \"b/*.csv:mimalloc\"");
  }
  return sessions;
}

/**
 * Lays out one row per save with one bar per session. Rows are ordered by `sort` (`total` ranks by
 * the first session that has the save), inside `--group-by` groups when given. The table has one row
 * per save: each session's total, then each later session's change against the first.
 */
export function buildPaired(items: PairedItem[], segments: PairedSegment[], options: PairedOptions): PairedLayout {
  const { sessions } = options;
  type Row = { label: string; group?: string; bySession: Map<string, PairedItem> };
  const rows: Row[] = [];
  const rowByKey = new Map<string, Row>();
  for (const item of items) {
    const key = `${item.group ?? ""}\u0000${item.label}`;
    let row = rowByKey.get(key);
    if (!row) {
      row = { label: item.label, group: item.group, bySession: new Map() };
      rowByKey.set(key, row);
      rows.push(row);
    }
    if (row.bySession.has(item.session)) {
      throw new UserError(`--paired: two rows are labelled "${item.label}" in session "${item.session}"`);
    }
    row.bySession.set(item.session, item);
  }

  const firstTotal = (row: Row): number => {
    for (const session of sessions) {
      const item = row.bySession.get(session);
      if (item) return item.total;
    }
    return 0;
  };
  const compare = rowComparator<Row & { displayName: string }>(options.sort, (row) => options.higherIsBetter ? -firstTotal(row) : firstTotal(row));
  const withName = rows.map(row => ({ ...row, displayName: row.label }));
  const sorted = [...withName].sort((a, b) => {
    if (options.groupBy.length > 0) {
      const ai = options.groupBy.indexOf(a.group ?? "");
      const bi = options.groupBy.indexOf(b.group ?? "");
      if (ai !== bi) return ai - bi;
    }
    return compare(a, b);
  });

  // Chart rows: a header row before each group, then the saves.
  const chartRows: ({ kind: "spacer"; label: string } | { kind: "data"; row: Row })[] = [];
  let lastGroup: string | null = null;
  for (const row of sorted) {
    if (options.groupBy.length > 0 && row.group !== lastGroup) {
      chartRows.push({ kind: "spacer", label: groupLabel(options.groupLabels, row.group ?? "") });
      lastGroup = row.group ?? null;
    }
    chartRows.push({ kind: "data", row });
  }

  const labels = chartRows.map(r => r.kind === "spacer" ? options.spacerPrefix + r.label : r.row.label);
  const valueOf = (row: Row, session: string, segmentName: string | null): number | null => {
    const item = row.bySession.get(session);
    if (!item) return null;
    return segmentName === null ? item.total : (item.segments.get(segmentName) ?? 0);
  };
  const datasets: PairedDataset[] = sessions.flatMap((session): PairedDataset[] =>
    options.singleBar
      ? [{ label: session, stack: session, session, segmentName: null, data: chartRows.map(r => r.kind === "spacer" ? null : valueOf(r.row, session, null)) }]
      : segments.map(segment => ({
          label: segment.description,
          stack: session,
          session,
          segmentName: segment.name,
          data: chartRows.map(r => r.kind === "spacer" ? null : valueOf(r.row, session, segment.name)),
        })),
  );

  const fmt = (value: number | null): string | number =>
    value === null ? "" : options.digits === 0 ? Math.round(value) : parseFloat(value.toFixed(options.digits));
  const header = [
    ...(options.groupBy.length > 0 ? ["Group"] : []),
    "Save File",
    ...sessions.map(s => `${options.totalLabel} (${s})`),
    ...sessions.slice(1).flatMap(s => [`+/- ${s} vs ${sessions[0]}`, `% ${s} vs ${sessions[0]}`]),
  ];
  const tableRows = sorted.map(row => {
    const first = row.bySession.get(sessions[0])?.total ?? null;
    return [
      ...(options.groupBy.length > 0 ? [groupLabel(options.groupLabels, row.group ?? "")] : []),
      row.label,
      ...sessions.map(s => fmt(row.bySession.get(s)?.total ?? null)),
      ...sessions.slice(1).flatMap(s => {
        const other = row.bySession.get(s)?.total ?? null;
        if (first === null || other === null) return ["", ""];
        return [formatSigned(other - first, options.digits), formatPercentChange(first, other)];
      }),
    ];
  });

  return { labels, datasets, table: { header, rows: tableRows }, rowCount: chartRows.length };
}

/**
 * Names each session's bar at its base, since stacked pairs share one legend. Draws on the first
 * dataset of every session (`firstDatasetBySession`: dataset index -> session name).
 */
export const createSessionLabelsPlugin = (firstDatasetBySession: Map<number, string>) => ({
  id: "sessionLabels",
  afterDatasetsDraw(chart: any) {
    const { ctx, scales } = chart;
    ctx.save();
    ctx.font = font(11, true);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = colors.white;
    ctx.strokeStyle = colors.black;
    ctx.lineWidth = 3;
    const x = scales.x.getPixelForValue(0) + 4;
    firstDatasetBySession.forEach((session, datasetIndex) => {
      const dataset = chart.data.datasets[datasetIndex];
      const meta = chart.getDatasetMeta(datasetIndex);
      meta.data.forEach((element: any, index: number) => {
        if (dataset.data[index] === null || dataset.data[index] === undefined) return;
        const y = element.getProps(["y"], true).y;
        ctx.strokeText(session, x, y);
        ctx.fillText(session, x, y);
      });
    });
    ctx.restore();
  },
});

const SESSION_NOTE_PREFIX = "Bars per row, top to bottom: ";

/**
 * Legend settings for a paired chart. Stacked pairs repeat every segment once per session, so the
 * legend lists each segment once and adds a note naming the sessions in bar order; a single-bar
 * pair already has one legend entry (and color) per session. `rank` orders the entries.
 */
export function pairedLegendLabels(sessions: string[], singleBar: boolean, rank: (text: string) => number) {
  return {
    generateLabels: (chart: any) => {
      const items = Chart.defaults.plugins.legend.labels.generateLabels(chart);
      if (singleBar) return items;
      return [
        ...items,
        {
          text: SESSION_NOTE_PREFIX + sessions.join(", "),
          fillStyle: "rgba(0,0,0,0)",
          strokeStyle: "rgba(0,0,0,0)",
          lineWidth: 0,
          fontColor: colors.white,
          hidden: false,
        },
      ];
    },
    // Keep only the first dataset of each repeated segment label.
    filter: (item: any, data: any) =>
      item.datasetIndex === undefined || data.datasets.findIndex((d: any) => d.label === item.text) === item.datasetIndex,
    sort: (a: any, b: any) => {
      const key = (item: any) => String(item.text).startsWith(SESSION_NOTE_PREFIX) ? Number.MAX_SAFE_INTEGER : rank(item.text);
      return key(a) - key(b);
    },
  };
}
