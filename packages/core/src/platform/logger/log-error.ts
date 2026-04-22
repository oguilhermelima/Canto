/**
 * Returns a catch handler that logs the error with context and swallows it.
 * Used for fire-and-forget async operations (queue dispatches, best-effort updates).
 */
export function logAndSwallow(context: string) {
  return (err: unknown) => {
    console.error(`[${context}]`, err instanceof Error ? err.message : err);
  };
}
