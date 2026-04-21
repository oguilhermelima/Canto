import { and, eq, sql, type SQL } from "drizzle-orm";
import {
  episode,
  episodeTranslation,
  media,
  mediaTranslation,
  season,
  seasonTranslation,
} from "@canto/db/schema";

/**
 * Build the JOIN condition + COALESCE expressions for `media_translation` /
 * `episode_translation` / `season_translation`. Always-on by design — every
 * media-returning query takes a `language` and runs the LEFT JOIN. For en-US
 * users with English-original media this matches no row and COALESCE falls
 * back to the raw `media.X` column. The cost is one indexed FK lookup per
 * row; the win is a single code path with no `if-en` branching.
 */

export interface MediaI18n {
  /** LEFT JOIN condition for `mediaTranslation`. Always non-null. */
  join: SQL;
  title: SQL<string>;
  overview: SQL<string | null>;
  posterPath: SQL<string | null>;
  logoPath: SQL<string | null>;
  tagline: SQL<string | null>;
  trailerKey: SQL<string | null>;
}

export function mediaI18n(language: string): MediaI18n {
  return {
    join: and(
      eq(mediaTranslation.mediaId, media.id),
      eq(mediaTranslation.language, language),
    )!,
    title: sql<string>`COALESCE(NULLIF(TRIM(${mediaTranslation.title}), ''), ${media.title})`,
    overview: sql<string | null>`COALESCE(NULLIF(TRIM(${mediaTranslation.overview}), ''), ${media.overview})`,
    posterPath: sql<string | null>`COALESCE(${mediaTranslation.posterPath}, ${media.posterPath})`,
    logoPath: sql<string | null>`COALESCE(${mediaTranslation.logoPath}, ${media.logoPath})`,
    tagline: sql<string | null>`COALESCE(NULLIF(TRIM(${mediaTranslation.tagline}), ''), ${media.tagline})`,
    // Translation-specific trailer key first; fall back to any YouTube trailer.
    trailerKey: sql<string | null>`COALESCE(${mediaTranslation.trailerKey}, (
      SELECT external_key FROM media_video
      WHERE media_id = ${media.id}
        AND type = 'Trailer' AND site = 'YouTube'
      LIMIT 1
    ))`,
  };
}

export interface EpisodeI18n {
  join: SQL;
  title: SQL<string | null>;
  overview: SQL<string | null>;
}

export function episodeI18n(language: string): EpisodeI18n {
  return {
    join: and(
      eq(episodeTranslation.episodeId, episode.id),
      eq(episodeTranslation.language, language),
    )!,
    title: sql<string | null>`COALESCE(NULLIF(TRIM(${episodeTranslation.title}), ''), ${episode.title})`,
    overview: sql<string | null>`COALESCE(NULLIF(TRIM(${episodeTranslation.overview}), ''), ${episode.overview})`,
  };
}

export interface SeasonI18n {
  join: SQL;
  name: SQL<string | null>;
  overview: SQL<string | null>;
}

export function seasonI18n(language: string): SeasonI18n {
  return {
    join: and(
      eq(seasonTranslation.seasonId, season.id),
      eq(seasonTranslation.language, language),
    )!,
    name: sql<string | null>`COALESCE(NULLIF(TRIM(${seasonTranslation.name}), ''), ${season.name})`,
    overview: sql<string | null>`COALESCE(NULLIF(TRIM(${seasonTranslation.overview}), ''), ${season.overview})`,
  };
}
