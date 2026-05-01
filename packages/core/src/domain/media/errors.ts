import { DomainError } from "@canto/core/domain/shared/errors";

export class TmdbCallExhaustedError extends DomainError {
  readonly code = "INTERNAL" as const;

  constructor() {
    super("TMDB call failed after retries");
  }
}

export class EnsureMediaNotFoundError extends DomainError {
  readonly code = "NOT_FOUND" as const;

  constructor(mediaId: string) {
    super(`ensureMedia: media ${mediaId} not found`);
  }
}

export class EmptyVersionListError extends DomainError {
  readonly code = "BAD_REQUEST" as const;

  constructor() {
    super("No versions to resolve");
  }
}

export class MediaVersionNotFoundError extends DomainError {
  readonly code = "NOT_FOUND" as const;

  constructor() {
    super("Media version not found");
  }
}

export class MediaInsertConflictError extends DomainError {
  readonly code = "CONFLICT" as const;

  constructor() {
    super("Failed to insert media — conflict without existing row");
  }
}

export class MediaUpdateFailedError extends DomainError {
  readonly code = "INTERNAL" as const;

  constructor() {
    super("Failed to update media");
  }
}

export class MediaPostInsertNotFoundError extends DomainError {
  readonly code = "INTERNAL" as const;

  constructor() {
    super("Media not found after insert");
  }
}

export class EnrichmentRegistryCycleError extends DomainError {
  readonly code = "INTERNAL" as const;

  constructor() {
    super("enrichment registry has a dependency cycle");
  }
}
