import { describe, expect, it } from "vitest";
import { MetricProfiles } from "../charts/metricProfiles";
import { metricStyles } from "../charts/constants";

describe("MetricProfiles", () => {
  it.each(Object.entries(MetricProfiles))("every %s metric has an explicit style", (_, metrics) => {
    const unstyled = metrics.filter(metric => !metricStyles[metric.name]).map(metric => metric.name);
    expect(unstyled).toEqual([]);
  });
});
