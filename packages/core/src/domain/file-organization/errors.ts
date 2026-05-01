import { DomainError } from "@canto/core/domain/shared/errors";

export class InvalidPathError extends DomainError {
  readonly code = "BAD_REQUEST" as const;
}

export class ReorganizeWhileImportingError extends DomainError {
  readonly code = "CONFLICT" as const;

  constructor() {
    super("Cannot reorganize files while a download is being imported");
  }
}

export class ReorganizeRequiresClientError extends DomainError {
  readonly code = "BAD_REQUEST" as const;

  constructor() {
    super("Download client required for remote reorganize");
  }
}
