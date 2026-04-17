export interface JobLogger {
  info: (fields: Record<string, unknown> | string, msg?: string) => void;
  warn: (fields: Record<string, unknown> | string, msg?: string) => void;
  error: (fields: Record<string, unknown> | string, msg?: string) => void;
}

function formatLine(
  level: "info" | "warn" | "error",
  queue: string,
  jobId: string | undefined,
  fields: Record<string, unknown> | string,
  msg?: string,
): [string, ...unknown[]] {
  const prefix = jobId ? `[${queue} ${jobId}]` : `[${queue}]`;
  if (typeof fields === "string") {
    return [`${prefix} ${fields}`];
  }
  if (msg) {
    return [`${prefix} ${msg}`, fields];
  }
  return [prefix, fields];
}

/**
 * Build a logger pre-tagged with `{ queue, jobId }`. Replaces hand-written
 * `console.log("[queue] …")` prefixes across the worker so every log line
 * has consistent structure and jobId for correlation.
 */
export function createJobLogger(queue: string, jobId?: string): JobLogger {
  return {
    info: (fields, msg) => console.log(...formatLine("info", queue, jobId, fields, msg)),
    warn: (fields, msg) => console.warn(...formatLine("warn", queue, jobId, fields, msg)),
    error: (fields, msg) => console.error(...formatLine("error", queue, jobId, fields, msg)),
  };
}
