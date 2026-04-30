import { DomainError } from "@canto/core/domain/shared/errors";

export class SeasonNotFoundError extends DomainError {
  readonly code = "NOT_FOUND" as const;

  constructor(identifier?: string | number) {
    super(
      identifier !== undefined
        ? `Season ${identifier} not found`
        : "Season not found",
    );
  }
}

export class EpisodeNotFoundError extends DomainError {
  readonly code = "NOT_FOUND" as const;

  constructor(identifier?: string) {
    super(
      identifier ? `Episode ${identifier} not found` : "Episode not found",
    );
  }
}

export class InvalidWatchInputError extends DomainError {
  readonly code = "BAD_REQUEST" as const;
}
