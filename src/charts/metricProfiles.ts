import { MetricName } from "../data/Metric";
import { MetricEnum } from "../data/MetricEnum";

const LINE_CHART: readonly MetricEnum[] = [
    MetricEnum.ENTITY_UPDATE,
    MetricEnum.TRAINS,
    MetricEnum.CONTROL_BEHAVIOR_UPDATE,
    MetricEnum.TRANSPORT_LINES_UPDATE,
    MetricEnum.ELECTRIC_HEAT_FLUID_CIRCUIT_UPDATE,
    MetricEnum.SPACE_PLATFORMS,
    MetricEnum.PARTICLE_UPDATE,
];

const SUMMARY_CHART: readonly MetricEnum[] = [
    ...LINE_CHART,
    MetricEnum.ELECTRIC_NETWORK_UPDATE,
    MetricEnum.FLUID_FLOW_UPDATE,
    MetricEnum.HEAT_NETWORK_UPDATE,
    MetricEnum.POLLUTION_UPDATE,
    MetricEnum.OTHER,
];

/**
 * Default metric sets (and their legend/stack order) for each chart type.
 *
 * Every metric listed here must have an explicit entry in `metricStyles` (charts/constants.ts)
 * so it gets a stable color-blind-friendly color, or a pattern fill when the hue isn't
 * color-blind-friendly (enforced by a test). Users can opt out via `--allow-unfiltered-metrics`.
 */
export const MetricProfiles = { LINE_CHART, SUMMARY_CHART };

/** Converts a MetricEnum array to a name-keyed lookup record (preserves array order). */
export function toMetricRecord(metrics: readonly MetricEnum[]): Partial<Record<MetricName, MetricEnum>> {
    return Object.fromEntries(metrics.map(it => [it.name, it]));
}
