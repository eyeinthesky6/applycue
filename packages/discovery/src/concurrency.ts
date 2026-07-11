export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (!Number.isFinite(limit) || limit < 1) {
    throw new RangeError("concurrency limit must be a positive number");
  }
  if (items.length === 0) return [];

  const results = new Array<R>(items.length);
  const workerCount = Math.min(Math.floor(limit), items.length);
  let nextIndex = 0;

  async function consume(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index] as T, index);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => consume()));
  return results;
}
