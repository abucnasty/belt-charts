import { describe, it, expect, afterEach } from "vitest";
import { Chart } from "chart.js";
import { getFontScale, setFontScale } from "../charts/fontScale";
import { font, scaled } from "../charts/fonts";
import { chartLayout } from "../charts/constants";
import { tableReservedHeight } from "../charts/Table";
import { createSummaryChartConfiguration } from "../charts/SummaryChart";
import { createEntityBreakdownChartConfiguration } from "../charts/EntityBreakdownChart";
import { AggregationStrategy } from "../data/AggregationStrategy";
import { MetricEnum } from "../data/MetricEnum";
import { parseFontScale } from "../commands/utils";
import { UserError } from "../utils";
import { makeResult } from "./fixtures";

afterEach(() => setFontScale(1));

describe("font scale", () => {
  it("defaults to 1 and leaves sizes untouched", () => {
    expect(getFontScale()).toBe(1);
    expect(scaled(18)).toBe(18);
    expect(font(12, true)).toContain("bold 12px");
    expect(chartLayout.TABLE_ROW_HEIGHT_PX).toBe(20);
    expect(Chart.defaults.font.size).toBe(12);
  });

  it("scales text sizes, Chart.js defaults and text-fitting layout measures together", () => {
    setFontScale(1.5);
    expect(scaled(18)).toBe(27);
    expect(font(12)).toMatch(/^18px /);
    expect(Chart.defaults.font.size).toBe(18);
    expect(chartLayout.TABLE_ROW_HEIGHT_PX).toBe(30);
    expect(chartLayout.MIN_BAR_ROW_HEIGHT_PX).toBe(39);
    expect(tableReservedHeight(2)).toBe(2 * 21 + 2 * 30 + 15);
  });

  it("keeps measures that are not about text", () => {
    setFontScale(2);
    expect(chartLayout.TICKS_PER_SECOND).toBe(60);
    expect(chartLayout.AXIS_SCALE_UPPER_PADDING).toBe(1.1);
  });

  it("restores the defaults when set back to 1", () => {
    setFontScale(3);
    setFontScale(1);
    expect(Chart.defaults.font.size).toBe(12);
    expect(chartLayout.BAR_CHART_CHROME_HEIGHT_PX).toBe(140);
  });

  it("validates the option", () => {
    expect(parseFontScale("1.25")).toBe(1.25);
    expect(() => parseFontScale("0")).toThrow(UserError);
    expect(() => parseFontScale("-1")).toThrow(UserError);
    expect(() => parseFontScale("big")).toThrow(UserError);
  });
});

describe("charts follow the font scale", () => {
  const results = [
    makeResult("a", { wholeUpdate: 1000, entityUpdate: 700, Inserter: 400 }),
    makeResult("b", { wholeUpdate: 1100, entityUpdate: 800, Inserter: 500 }),
  ];
  const summary = () => createSummaryChartConfiguration(results, {
    aggregationStrategy: AggregationStrategy.AVERAGE,
    metrics: [MetricEnum.WHOLE_UPDATE, MetricEnum.ENTITY_UPDATE],
    includeTable: true,
  });

  it("scales the title and tick fonts and grows the recommended size", () => {
    // Tick fonts are scriptable options, resolved when the chart renders: read them while the scale is set.
    const tick = (config: any) => config.options.scales.y.ticks.font({ index: 0 }).size;
    const base = summary();
    expect((base.config.options!.plugins!.title!.font as any).size).toBe(18);
    expect(tick(base.config)).toBe(12);
    setFontScale(2);
    const big = summary();
    expect((big.config.options!.plugins!.title!.font as any).size).toBe(36);
    expect(tick(big.config)).toBe(24);
    expect(big.recommendedHeight).toBeGreaterThan(base.recommendedHeight);
    expect(big.recommendedWidth).toBeGreaterThan(base.recommendedWidth);
  });

  it("scales the entity chart too", () => {
    const entity = () => createEntityBreakdownChartConfiguration(results, { aggregationStrategy: AggregationStrategy.AVERAGE, includeTable: true });
    const base = entity();
    setFontScale(1.5);
    const big = entity();
    expect((big.config.options!.plugins!.title!.font as any).size).toBe(27);
    expect(big.recommendedHeight).toBeGreaterThan(base.recommendedHeight);
  });
});
