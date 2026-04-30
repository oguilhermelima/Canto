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
