export type DomainErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "UNAUTHORIZED"
  | "BAD_REQUEST"
  | "CONFLICT"
  | "INTERNAL";

export abstract class DomainError extends Error {
  abstract readonly code: DomainErrorCode;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

// ── NOT_FOUND ────────────────────────────────────────────────────────────────

export class MediaNotFoundError extends DomainError {
  readonly code = "NOT_FOUND" as const;

  constructor(mediaId?: string) {
    super(mediaId ? `Media ${mediaId} not found` : "Media not found");
  }
}

export class ListNotFoundError extends DomainError {
  readonly code = "NOT_FOUND" as const;

  constructor(listId?: string) {
    super(listId ? `List ${listId} not found` : "List not found");
  }
}

export class ListInvitationNotFoundError extends DomainError {
  readonly code = "NOT_FOUND" as const;

  constructor() {
    super("Invitation not found");
  }
}

// ── FORBIDDEN ────────────────────────────────────────────────────────────────

export class ListPermissionError extends DomainError {
  readonly code = "FORBIDDEN" as const;
}

// ── BAD_REQUEST ──────────────────────────────────────────────────────────────

export class SystemListModificationError extends DomainError {
  readonly code = "BAD_REQUEST" as const;

  constructor() {
    super("Cannot modify system lists");
  }
}

export class InvalidListNameError extends DomainError {
  readonly code = "BAD_REQUEST" as const;
}

export class ListInvitationInvalidError extends DomainError {
  readonly code = "BAD_REQUEST" as const;
}

export class InvalidPathError extends DomainError {
  readonly code = "BAD_REQUEST" as const;
}

export class InvalidDownloadInputError extends DomainError {
  readonly code = "BAD_REQUEST" as const;
}

// ── CONFLICT ─────────────────────────────────────────────────────────────────

export class BlocklistedReleaseError extends DomainError {
  readonly code = "CONFLICT" as const;

  constructor(reason: string) {
    super(`This release is blocklisted: ${reason}`);
  }
}

export class ListNameConflictError extends DomainError {
  readonly code = "CONFLICT" as const;

  constructor() {
    super("A list with this name already exists");
  }
}

export class DuplicateDownloadError extends DomainError {
  readonly code = "CONFLICT" as const;
}

// ── INTERNAL ─────────────────────────────────────────────────────────────────

export class DownloadClientError extends DomainError {
  readonly code = "INTERNAL" as const;
}

export class IndexerSearchError extends DomainError {
  readonly code = "INTERNAL" as const;
}

export class TorrentPersistenceError extends DomainError {
  readonly code = "INTERNAL" as const;

  constructor() {
    super("Failed to create torrent");
  }
}
