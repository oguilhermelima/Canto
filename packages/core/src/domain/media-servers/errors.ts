import { DomainError } from "@canto/core/domain/shared/errors";

/** Admin has not configured the named media server yet. */
export class ServerNotConfiguredError extends DomainError {
  readonly code = "BAD_REQUEST" as const;

  constructor(public readonly provider: "plex" | "jellyfin") {
    super(`${provider} server not configured by administrator`);
  }
}

/** Trying to persist a userConnection without a successful authentication. */
export class UserConnectionMissingAuthError extends DomainError {
  readonly code = "BAD_REQUEST" as const;

  constructor() {
    super("Cannot add connection without successful authentication");
  }
}

/** Validation rejection for a service URL the admin tried to register. */
export class InvalidServiceUrlError extends DomainError {
  readonly code = "BAD_REQUEST" as const;
}
