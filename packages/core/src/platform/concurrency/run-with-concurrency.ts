/**
 * Runs `fn` for each item in `items`, capping in-flight calls at `limit`.
 * Returns the results in the same order as the input.
 *
 * Equivalent to `Promise.all(items.map(fn))` but with a worker pool so
 * fan-out into rate-limited dependencies (qBit / Prowlarr / TMDB / fs)
 * stays bounded.
 */
export async function runWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const cap = Math.max(1, Math.min(limit, items.length));
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i] as T, i);
    }
  }

  await Promise.all(Array.from({ length: cap }, () => worker()));
  return results;
}
