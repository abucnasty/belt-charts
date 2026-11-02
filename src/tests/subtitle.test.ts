import { describe, it, expect, afterEach } from "vitest";
import { subtitleHeight, subtitleOptions } from "../charts/subtitle";
import { setFontScale } from "../charts/fontScale";
import { createSummaryChartConfiguration } from "../charts/SummaryChart";
import { createEntityBreakdownChartConfiguration } from "../charts/EntityBreakdownChart";
import { createBoxPlotChartConfiguration } from "../charts/BoxPlot";
import { AggregationStrategy } from "../data/AggregationStrategy";
import { MetricEnum } from "../data/MetricEnum";
import { makeResult } from "./fixtures";

afterEach(() => setFontScale(1));

describe("subtitleOptions", () => {
  it("is hidden without text", () => {
    expect(subtitleOptions(undefined).display).toBe(false);
    expect(subtitleOptions(null).display).toBe(false);
    expect(subtitleOptions("").display).toBe(false);
  });

  it("shows the text smaller than the 18px title", () => {
    const options = subtitleOptions("15000 ticks, 10 runs");
    expect(options.display).toBe(true);
    expect(options.text).toBe("15000 ticks, 10 runs");
    expect((options.font as any).size).toBe(13);
  });

  it("follows the font scale", () => {
    setFontScale(2);
    expect((subtitleOptions("x").font as any).size).toBe(26);
    expect(subtitleHeight("x")).toBe(26 + 16);
    expect(subtitleHeight(null)).toBe(0);
  });
});

describe("charts carry the subtitle", () => {
  const results = [
    makeResult("a", { wholeUpdate: 1000, entityUpdate: 700, Inserter: 400 }, { runMeans: { wholeUpdate: [990, 1010] } }),
    makeResult("b", { wholeUpdate: 1100, entityUpdate: 800, Inserter: 500 }, { runMeans: { wholeUpdate: [1090, 1110] } }),
  ];

  it("keeps the title and adds the subtitle on a summary chart", () => {
    const { config } = createSummaryChartConfiguration(results, {
      aggregationStrategy: AggregationStrategy.AVERAGE,
      metrics: [MetricEnum.WHOLE_UPDATE, MetricEnum.ENTITY_UPDATE],
      titleOverride: "Short title",
      subtitle: "run details",
    });
    const plugins = config.options!.plugins as any;
    expect(plugins.title.text).toBe("Short title");
    expect(plugins.subtitle).toMatchObject({ display: true, text: "run details" });
  });

  it("has a hidden subtitle by default", () => {
    const { config } = createSummaryChartConfiguration(results, { aggregationStrategy: AggregationStrategy.AVERAGE });
    expect((config.options!.plugins as any).subtitle.display).toBe(false);
  });

  it("works on the entity and box plot charts", () => {
    const entity = createEntityBreakdownChartConfiguration(results, { aggregationStrategy: AggregationStrategy.AVERAGE, subtitle: "s" });
    expect((entity.config.options!.plugins as any).subtitle.text).toBe("s");
    const box = createBoxPlotChartConfiguration(results, { minUpdateTime: null, maxUpdateTime: null, subtitle: "s" });
    expect((box.config.options!.plugins as any).subtitle.text).toBe("s");
  });
});
