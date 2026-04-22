import { DomainError } from "../shared/errors";

export class InvalidPathError extends DomainError {
  readonly code = "BAD_REQUEST" as const;
}
