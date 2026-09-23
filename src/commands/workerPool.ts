import { Worker } from "worker_threads";
import os from "os";

type WorkerResult<R> = { ok: true; result: R } | { ok: false; error: string };

// Each worker independently defaults to a heap limit sized off total system RAM (not divided
// across workers), so uncapped concurrency can let N workers collectively claim N times that
// much memory. Capping parallelism keeps the aggregate footprint bounded regardless of core count.
const DEFAULT_MAX_CONCURRENCY = 8;

/**
 * Runs `tasks` across a bounded pool of worker threads that re-invoke this same bundled
 * entry file (`__filename`), since the CLI is shipped as a single bundled dist/index.js.
 * Each task is handled by the entry point's `isMainThread` worker-dispatch branch.
 * `onTaskComplete` fires (in completion order, not input order) as each task finishes, and is
 * awaited before that worker slot is given its next task — this lets a slow downstream
 * consumer (e.g. serial rendering) throttle how far ahead of it the pool is allowed to parse.
 * Results are not retained here; consume them via `onTaskComplete` instead of a return value,
 * so a caller processing large per-task results doesn't need every one held in memory at once.
 */
export async function runInWorkerPool<T, R>(
  tasks: T[],
  options: { concurrency?: number; onTaskComplete?: (task: T, result: R) => void | Promise<void> } = {},
): Promise<void> {
  const defaultConcurrency = Math.min(os.cpus().length, DEFAULT_MAX_CONCURRENCY);
  const concurrency = Math.max(1, Math.min(options.concurrency ?? defaultConcurrency, tasks.length || 1));
  let nextIndex = 0;

  async function runNext(): Promise<void> {
    const index = nextIndex++;
    if (index >= tasks.length) return;
    const task = tasks[index];
    const result = await new Promise<R>((resolve, reject) => {
      const worker = new Worker(__filename, { workerData: task });
      worker.once("message", (message: WorkerResult<R>) => {
        if (message.ok) {
          resolve(message.result);
        } else {
          reject(new Error(message.error));
        }
      });
      worker.once("error", reject);
      worker.once("exit", (code) => {
        if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`));
      });
    });
    await options.onTaskComplete?.(task, result);
    await runNext();
  }

  await Promise.all(Array.from({ length: concurrency }, () => runNext()));
}
