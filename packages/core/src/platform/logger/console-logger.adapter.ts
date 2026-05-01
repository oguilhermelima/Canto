import type { LoggerPort } from "@canto/core/domain/shared/ports/logger.port";

/**
 * Standalone catch handler for entry points (workers, API routers) that
 * have no deps pattern. Domain code must use `LoggerPort.logAndSwallow`
 * via injected deps instead.
 */
export function logAndSwallow(scope: string): (err: unknown) => void {
  return (err: unknown) => {
    console.error(`[${scope}]`, err instanceof Error ? err.message : err);
  };
}

export function makeConsoleLogger(): LoggerPort {
  return {
    warn(message: string, context?: Record<string, unknown>): void {
      if (context !== undefined) {
        console.warn(message, context);
      } else {
        console.warn(message);
      }
    },

    error(message: string, context?: Record<string, unknown>): void {
      if (context !== undefined) {
        console.error(message, context);
      } else {
        console.error(message);
      }
    },

    info(message: string, context?: Record<string, unknown>): void {
      if (context !== undefined) {
        console.log(message, context);
      } else {
        console.log(message);
      }
    },

    logAndSwallow(scope: string): (err: unknown) => void {
      return (err: unknown) => {
        console.error(`[${scope}]`, err instanceof Error ? err.message : err);
      };
    },
  };
}
