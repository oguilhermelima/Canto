import { DomainError } from "@canto/core/domain/shared/errors";

export class InvalidPathError extends DomainError {
  readonly code = "BAD_REQUEST" as const;
}
