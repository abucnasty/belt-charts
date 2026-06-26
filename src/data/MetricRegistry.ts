import { MetricName } from "./Metric";
import { MetricEnum } from "./MetricEnum";

/**
 * Named metric sets used by each chart type.
 * Update these lists here rather than inside individual chart files.
 */
export const MetricProfiles = {
    /** Metrics shown in line/bar timeseries charts. */
    LINE_CHART: [
        MetricEnum.ENTITY_UPDATE,
        MetricEnum.TRAINS,
        MetricEnum.CONTROL_BEHAVIOR_UPDATE,
        MetricEnum.TRANSPORT_LINES_UPDATE,
        MetricEnum.ELECTRIC_HEAT_FLUID_CIRCUIT_UPDATE,
        MetricEnum.SPACE_PLATFORMS,
        MetricEnum.PARTICLE_UPDATE,
    ] as MetricEnum[],

    /** Metrics shown in summary / summary-per-run stacked-bar charts. */
    SUMMARY_CHART: [
        MetricEnum.ENTITY_UPDATE,
        MetricEnum.TRAINS,
        MetricEnum.CONTROL_BEHAVIOR_UPDATE,
        MetricEnum.TRANSPORT_LINES_UPDATE,
        MetricEnum.ELECTRIC_HEAT_FLUID_CIRCUIT_UPDATE,
        MetricEnum.SPACE_PLATFORMS,
        MetricEnum.PARTICLE_UPDATE,
        MetricEnum.ELECTRIC_NETWORK_UPDATE,
        MetricEnum.FLUID_FLOW_UPDATE,
        MetricEnum.HEAT_NETWORK_UPDATE,
        MetricEnum.OTHER,
    ] as MetricEnum[],
} as const;

/**
 * Converts a MetricEnum array to a name-keyed lookup record.
 * Useful for O(1) membership checks inside chart rendering code.
 */
export function toMetricRecord(metrics: readonly MetricEnum[]): Partial<Record<MetricName, MetricEnum>> {
    return Object.fromEntries(metrics.map(it => [it.name, it]));
}

export class MetricRegistry {
    private readonly metrics: Map<MetricName, MetricEnum> = new Map();

    constructor(metrics: MetricEnum[] = []) {
        this.setMany(metrics);
    }

    public set(metric: MetricEnum) {
        this.metrics.set(metric.name, metric);
    }

    public setMany(metrics: MetricEnum[]) {
        metrics.forEach((metric) => this.set(metric));
    }

    public get(name: MetricName): MetricEnum | null {
        return this.metrics.get(name) ?? null;
    }

    public getOrThrow(name: string): MetricEnum {
        const metric = this.get(name as MetricName);
        if (!metric) {
            throw new Error(`Metric not supported: ${name}`);
        }
        return metric;
    }

    public all(): MetricEnum[] {
        return Array.from(this.metrics.values())
    }

    public getChildrenOf(parentName: MetricName): MetricEnum[] {
        return this.all().filter(metric => (metric as { parent?: string }).parent === parentName);
    }
}

export const MetricRegistryInstance = new MetricRegistry(Object.values(MetricEnum));