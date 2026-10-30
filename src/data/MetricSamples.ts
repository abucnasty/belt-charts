import type { MetricAggregate } from "./BenchmarkAggregateResult";

const INITIAL_CAPACITY = 1024;

/**
 * Compact, append-only collection of raw metric samples used to compute aggregate stats.
 *
 * Verbose-metrics CSVs can have millions of rows x 100+ metric columns, so samples are held in a
 * growable Float64Array (8 bytes per value, allocated outside the V8 heap) instead of a JS array of
 * objects. Zeros are only counted, never stored: most entity columns are 0 on nearly every tick,
 * so this keeps memory proportional to the non-zero data actually present.
 */
export class MetricSamples {
    private values = new Float64Array(0);
    private length = 0;
    private zeroCount = 0;

    get count(): number {
        return this.length + this.zeroCount;
    }

    push(value: number): void {
        if (value === 0) {
            this.zeroCount++;
            return;
        }
        if (this.length === this.values.length) {
            const grown = new Float64Array(Math.max(INITIAL_CAPACITY, this.values.length * 2));
            grown.set(this.values);
            this.values = grown;
        }
        this.values[this.length++] = value;
    }

    /** Combines several sample sets into one, e.g. every run of a metric for whole-file stats. */
    static merge(samples: MetricSamples[]): MetricSamples {
        const merged = new MetricSamples();
        merged.values = new Float64Array(samples.reduce((sum, s) => sum + s.length, 0));
        for (const s of samples) {
            merged.values.set(s.values.subarray(0, s.length), merged.length);
            merged.length += s.length;
            merged.zeroCount += s.zeroCount;
        }
        return merged;
    }

    /** Computes average / population std dev / min / max / median. Sorts the stored samples in place. */
    aggregate(): MetricAggregate {
        const n = this.count;
        if (n === 0) {
            throw new Error("MetricSamples: cannot aggregate an empty sample set");
        }
        const nonZero = this.values.subarray(0, this.length);
        nonZero.sort();

        let sum = 0;
        for (let i = 0; i < nonZero.length; i++) sum += nonZero[i];
        const mean = sum / n;

        let squaredDiffs = this.zeroCount * mean * mean;
        for (let i = 0; i < nonZero.length; i++) squaredDiffs += (nonZero[i] - mean) ** 2;

        // Zeros sit between the negative and positive stored values in sorted order.
        let negatives = 0;
        while (negatives < nonZero.length && nonZero[negatives] < 0) negatives++;
        const at = (i: number): number =>
            i < negatives ? nonZero[i] : i < negatives + this.zeroCount ? 0 : nonZero[i - this.zeroCount];

        const mid = Math.floor(n / 2);
        return {
            average: mean,
            standardDeviation: Math.sqrt(squaredDiffs / n),
            minimum: at(0),
            maximum: at(n - 1),
            median: n % 2 === 0 ? (at(mid - 1) + at(mid)) / 2 : at(mid),
        };
    }
}
