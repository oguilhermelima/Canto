export interface LoggerPort {
  /** Surface a recoverable failure with structured context. Never throws. */
  warn(message: string, context?: Record<string, unknown>): void;
  /** Surface a higher-severity failure. Never throws. */
  error(message: string, context?: Record<string, unknown>): void;
  /** Informational log. Optional in adapters — no-op is fine. */
  info?(message: string, context?: Record<string, unknown>): void;
  /**
   * Returns a catch handler that logs the error with context and swallows it.
   * Replaces the existing logAndSwallow helper used in domain code.
   */
  logAndSwallow(scope: string): (err: unknown) => void;
}
