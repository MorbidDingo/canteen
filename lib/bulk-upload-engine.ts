export type RowProcessStatus = "created" | "skipped" | "error";

export type RowProgressLog = {
  row: number;
  status: RowProcessStatus;
  message: string;
};

export type ProgressEmitter = (
  log: RowProgressLog,
  processed: number,
  total: number
) => void;

export function chunkArray<T>(arr: T[], size: number): T[][] {
  if (size <= 0) return [arr];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

export function createLimiter(concurrency: number) {
  const maxConcurrency = Math.max(1, concurrency);
  let active = 0;
  const queue: Array<() => void> = [];

  const runNext = () => {
    if (active >= maxConcurrency) return;
    const next = queue.shift();
    if (!next) return;
    active += 1;
    next();
  };

  return function limit<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const task = () => {
        fn()
          .then(resolve)
          .catch(reject)
          .finally(() => {
            active -= 1;
            runNext();
          });
      };

      queue.push(task);
      runNext();
    });
  };
}

// ✅ Fixed: cursor atomically claimed before await, preventing index skips
export async function runParallelForEach<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>
): Promise<void> {
  if (items.length === 0) return;

  const maxConcurrency = Math.max(1, Math.min(concurrency, items.length));
  // Use an object so all worker closures share the same mutable reference
  const state = { cursor: 0 };

  const workerFn = async () => {
    while (true) {
      // Claim index before any await — prevents two workers taking the same slot
      const idx = state.cursor++;
      if (idx >= items.length) return;
      await worker(items[idx], idx);
    }
  };

  await Promise.all(Array.from({ length: maxConcurrency }, workerFn));
}

// ✅ Fixed: tasks are lazy factories, queued one at a time instead of all at once
export async function runParallelRows<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length);

  await runParallelForEach(tasks, concurrency, async (task, index) => {
    try {
      results[index] = { status: "fulfilled", value: await task() };
    } catch (reason) {
      results[index] = { status: "rejected", reason };
    }
  });

  return results;
}