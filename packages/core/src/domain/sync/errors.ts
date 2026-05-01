import { DomainError } from "@canto/core/domain/shared/errors";

/**
 * Thrown by server scanners when the upstream server rejects the request as
 * unauthorized (HTTP 401/403). The worker catches this to mark the
 * user_connection as stale so the UI can prompt the user to re-authenticate.
 */
export class SyncAuthError extends DomainError {
  readonly code = "UNAUTHORIZED" as const;
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/**
 * Thrown by server scanners when the upstream HTTP fetch fails for a reason
 * other than auth (5xx, malformed payload, unexpected status). Distinguishes
 * the recoverable "server is flaky" path from a domain rule violation.
 */
export class SyncFetchError extends DomainError {
  readonly code = "INTERNAL" as const;
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}
