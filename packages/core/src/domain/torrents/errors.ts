import { DomainError } from "@canto/core/domain/shared/errors";

export class BlocklistedReleaseError extends DomainError {
  readonly code = "CONFLICT" as const;

  constructor(reason: string) {
    super(`This release is blocklisted: ${reason}`);
  }
}

export class DuplicateDownloadError extends DomainError {
  readonly code = "CONFLICT" as const;
}

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

export class InvalidDownloadInputError extends DomainError {
  readonly code = "BAD_REQUEST" as const;
}

export class MissingDownloadUrlError extends DomainError {
  readonly code = "BAD_REQUEST" as const;

  constructor() {
    super("No download URL saved for this torrent.");
  }
}

export class TorrentMissingHashError extends DomainError {
  readonly code = "BAD_REQUEST" as const;

  constructor() {
    super("Torrent has no hash");
  }
}

export class TorrentEmptyError extends DomainError {
  readonly code = "BAD_REQUEST" as const;

  constructor() {
    super("No files in torrent");
  }
}

export class TorrentNotFoundInClientError extends DomainError {
  readonly code = "NOT_FOUND" as const;

  constructor(hash: string) {
    super(`Torrent ${hash} not found in download client`);
  }
}
