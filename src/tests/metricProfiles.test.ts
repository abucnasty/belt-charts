import { describe, expect, it } from "vitest";
import { MetricProfiles } from "../charts/metricProfiles";
import { colors, metricStyles } from "../charts/constants";
import { EntityMetricEnum } from "../data/MetricEnum";

const colorblindFriendly = new Set<string>(Object.values(colors));

describe("entity styles", () => {
  const entityStyles = Object.values(EntityMetricEnum).map(metric => ({ name: metric.name, style: metricStyles[metric.name] }));

  it("gives every entity a unique color + pattern combination", () => {
    const seen = new Map<string, string>();
    const duplicates = entityStyles.flatMap(({ name, style }) => {
      const key = `${style.color}|${style.pattern ?? "solid"}`;
      const clash = seen.get(key);
      seen.set(key, name);
      return clash ? [`${clash} / ${name}`] : [];
    });
    expect(duplicates).toEqual([]);
  });

  it("only uses solid fills for colorblind-friendly colors", () => {
    const unpatterned = entityStyles
      .filter(({ style }) => !style.pattern && !colorblindFriendly.has(style.color))
      .map(({ name }) => name);
    expect(unpatterned).toEqual([]);
  });
});

describe("MetricProfiles", () => {
  it.each(Object.entries(MetricProfiles))("every %s metric has an explicit style", (_, metrics) => {
    const unstyled = metrics.filter(metric => !metricStyles[metric.name]).map(metric => metric.name);
    expect(unstyled).toEqual([]);
  });
});
