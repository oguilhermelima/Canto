/** Map a thrown error during a setup fetch to a user-facing message. */
export function fetchError(err: unknown, fallback: string): string {
  if (err instanceof Error && !err.message.includes("fetch")) return err.message;
  const cause = (err as { cause?: { message?: string } }).cause?.message;
  return cause ? `Cannot reach server: ${cause}` : fallback;
}
