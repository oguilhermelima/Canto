export interface CachePort {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  invalidate(pattern: string): Promise<void>;

  /**
   * Cache-through: return the cached value if present, otherwise call `fn`,
   * cache the result for `ttlSeconds`, and return it. Implementations must
   * fall back to running `fn` when the cache is unavailable rather than
   * surfacing the cache failure to the caller.
   */
  wrap<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T>;
}
