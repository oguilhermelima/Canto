import { DomainError } from "@canto/core/domain/shared/errors";

/**
 * Thrown when a Trakt access/refresh token has expired or been revoked and
 * the user must re-authenticate. Surfaces as 401 to the API layer.
 */
export class TraktAuthError extends DomainError {
  readonly code = "UNAUTHORIZED" as const;
}

/**
 * Thrown when the Trakt sync flow cannot proceed because of a remote-side or
 * adapter-side failure that's not auth (rate-limit, malformed response,
 * unexpected DELETE 404, etc). Carries the optional remote status so the
 * caller can branch on it.
 */
export class TraktSyncError extends DomainError {
  readonly code = "INTERNAL" as const;
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}
