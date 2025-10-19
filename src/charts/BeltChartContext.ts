import { AggregationStrategy } from "../data/AggregationStrategy"
import { MetricEnum } from "../data/MetricEnum"

export interface BeltChartContextInterface {
    aggregationStrategy: AggregationStrategy;
    maxTicks: number;
    metrics: MetricEnum[];
    outputFile: string;
    removeFirstTicks: number;
    trimPrefix: string;
    type: "summary" | "bar" | "line" | "boxplot" | "table";

    height?: number;
    maxUpdate?: number;
    summaryTable?: boolean;
    tickWindowAggregation?: number;
    width?: number;
}
/* 
interface BeltChartContextConstructor {
    /**
     * Creates a BeltChartContext from an input of options
     * @param options A set of options to apply to the BeltChartContext.
    fromOptions(options: Record<string, any>): BeltChartContext;
}
 */
export class BeltChartContext implements BeltChartContextInterface {
    aggregationStrategy: AggregationStrategy;
    maxTicks: number;
    metrics: MetricEnum[];
    outputFile: string;
    removeFirstTicks: number;
    trimPrefix: string;
    type: "summary" | "bar" | "line" | "boxplot" | "table";

    height?: number;
    maxUpdate?: number;
    summaryTable?: boolean;
    tickWindowAggregation?: number;
    width?: number;

    constructor(
        options: BeltChartContextInterface
    ) {
        this.aggregationStrategy = options.aggregationStrategy;
        this.maxTicks = options.maxTicks;
        this.metrics = options.metrics;
        this.outputFile = options.outputFile;
        this.removeFirstTicks = options.removeFirstTicks;
        this.trimPrefix = options.trimPrefix;
        this.type = options.type;

        this.height = options.height;
        this.maxUpdate = options.maxUpdate;
        this.summaryTable = options.summaryTable;
        this.tickWindowAggregation = options.tickWindowAggregation;
        this.width = options.width;
    }

    static fromOptions<T extends BeltChartContext>(options: Record<string, any>): T {
        return new BeltChartContext(options as BeltChartContextInterface) as T
    }
}
