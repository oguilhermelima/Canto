export abstract class DomainError extends Error {
  abstract readonly code: DomainErrorCode;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export type DomainErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "UNAUTHORIZED"
  | "BAD_REQUEST"
  | "CONFLICT"
  | "INTERNAL";

export class MediaNotFoundError extends DomainError {
  readonly code = "NOT_FOUND" as const;

  constructor(mediaId?: string) {
    super(mediaId ? `Media ${mediaId} not found` : "Media not found");
  }
}
