import { DomainError } from "@canto/core/domain/shared/errors";

/**
 * Cross-provider external identifiers for media. These are *not* internal
 * primary keys — they're the IDs that providers (TMDB / TVDB / IMDB) assign.
 * The `media` table stores them as plain `integer`/`varchar` columns; brands
 * exist only at the domain boundary so callers can't accidentally swap a
 * TMDB id for a TVDB id at a function boundary.
 */
export type TmdbId = number & { readonly __brand: "TmdbId" };
export type TvdbId = number & { readonly __brand: "TvdbId" };
export type ImdbId = string & { readonly __brand: "ImdbId" };

export class InvalidTmdbIdError extends DomainError {
  readonly code = "BAD_REQUEST" as const;

  constructor(raw: string | number) {
    super(`Invalid TMDB id: ${raw}`);
  }
}

/**
 * Validate a `string | number` at the brand boundary and return it as a
 * `TmdbId`. Accepts both shapes because route params arrive as strings while
 * provider responses arrive as numbers; both must be positive integers.
 */
export function parseTmdbId(raw: string | number): TmdbId {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new InvalidTmdbIdError(raw);
  return n as TmdbId;
}
