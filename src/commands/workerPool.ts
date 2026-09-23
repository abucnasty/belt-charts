import { Worker } from "worker_threads";
import os from "os";

type WorkerResult<R> = { ok: true; result: R } | { ok: false; error: string };

const DEFAULT_MAX_CONCURRENCY = 8;

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
