import { and, eq, sql  } from "drizzle-orm";
import type {SQL} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  episode,
  episodeLocalization,
  media,
  mediaLocalization,
  season,
  seasonLocalization,
} from "@canto/db/schema";

/**
 * Build the JOIN conditions + COALESCE expressions for the unified
 * `media_localization` / `episode_localization` / `season_localization`
 * tables. Always-on by design — every media-returning query takes a `language`
 * and runs two LEFT JOINs (user lang + en-US fallback). The COALESCE picks
 * the user's localization when present and falls back to the canonical en-US
 * row otherwise. The cost is two indexed FK lookups per row; the win is a
 * single 1-query reader path with no `if-en` branching and no post-fetch
 * translation overlay.
 *
 * Callers chain `.leftJoin(mi.locUser, mi.locUserJoin).leftJoin(mi.locEn,
 * mi.locEnJoin)` instead of the legacy `.leftJoin(mediaTranslation, mi.join)`.
 */

const EN = "en-US";

// drizzle's `and()` returns `SQL | undefined` (the union exists for empty-args
// or null-arg edge cases). Every call site here passes two non-null conditions
// so the result is always SQL; narrow with this helper to keep the join fields
// typed as `SQL` without sprinkling non-null assertions.
function asSql(
  expr: ReturnType<typeof and> | undefined,
  label: string,
): NonNullable<ReturnType<typeof and>> {
  if (expr === undefined) {
    throw new Error(`media-i18n: ${label} produced an empty SQL expression`);
  }
  return expr;
}

type MediaLocAlias = ReturnType<typeof alias<typeof mediaLocalization, string>>;
type EpisodeLocAlias = ReturnType<
  typeof alias<typeof episodeLocalization, string>
>;
type SeasonLocAlias = ReturnType<
  typeof alias<typeof seasonLocalization, string>
>;

export interface MediaI18n {
  /** Aliased `media_localization` row for the user's language. */
  locUser: MediaLocAlias;
  /** Aliased `media_localization` row for en-US (canonical fallback). */
  locEn: MediaLocAlias;
  /** LEFT JOIN condition for the user-language row. */
  locUserJoin: SQL;
  /** LEFT JOIN condition for the en-US fallback row. */
  locEnJoin: SQL;
  title: SQL<string>;
  overview: SQL<string | null>;
  posterPath: SQL<string | null>;
  logoPath: SQL<string | null>;
  tagline: SQL<string | null>;
}

export function mediaI18n(language: string): MediaI18n {
  const locUser = alias(mediaLocalization, "loc_user_media");
  const locEn = alias(mediaLocalization, "loc_en_media");
  return {
    locUser,
    locEn,
    locUserJoin: asSql(
      and(eq(locUser.mediaId, media.id), eq(locUser.language, language)),
      "locUserJoin",
    ),
    locEnJoin: asSql(
      and(eq(locEn.mediaId, media.id), eq(locEn.language, EN)),
      "locEnJoin",
    ),
    title: sql<string>`COALESCE(NULLIF(TRIM(${locUser.title}), ''), NULLIF(TRIM(${locEn.title}), ''), '')`,
    overview: sql<string | null>`COALESCE(NULLIF(TRIM(${locUser.overview}), ''), NULLIF(TRIM(${locEn.overview}), ''))`,
    posterPath: sql<string | null>`COALESCE(${locUser.posterPath}, ${locEn.posterPath})`,
    logoPath: sql<string | null>`COALESCE(${locUser.logoPath}, ${locEn.logoPath})`,
    tagline: sql<string | null>`COALESCE(NULLIF(TRIM(${locUser.tagline}), ''), NULLIF(TRIM(${locEn.tagline}), ''))`,
    // Trailer keys are intentionally NOT joined here — the correlated subquery
    // they used to need ran once per row in the main result set, swamping
    // larger feeds. Callers that need them should run
    // `findTrailerKeysForMediaIds` once on the final list of media ids.
  };
}

export interface EpisodeI18n {
  locUser: EpisodeLocAlias;
  locEn: EpisodeLocAlias;
  locUserJoin: SQL;
  locEnJoin: SQL;
  title: SQL<string | null>;
  overview: SQL<string | null>;
}

export function episodeI18n(language: string): EpisodeI18n {
  const locUser = alias(episodeLocalization, "loc_user_episode");
  const locEn = alias(episodeLocalization, "loc_en_episode");
  return {
    locUser,
    locEn,
    locUserJoin: asSql(
      and(eq(locUser.episodeId, episode.id), eq(locUser.language, language)),
      "episodeI18n.locUserJoin",
    ),
    locEnJoin: asSql(
      and(eq(locEn.episodeId, episode.id), eq(locEn.language, EN)),
      "episodeI18n.locEnJoin",
    ),
    title: sql<string | null>`COALESCE(NULLIF(TRIM(${locUser.title}), ''), NULLIF(TRIM(${locEn.title}), ''))`,
    overview: sql<string | null>`COALESCE(NULLIF(TRIM(${locUser.overview}), ''), NULLIF(TRIM(${locEn.overview}), ''))`,
  };
}

export interface SeasonI18n {
  locUser: SeasonLocAlias;
  locEn: SeasonLocAlias;
  locUserJoin: SQL;
  locEnJoin: SQL;
  name: SQL<string | null>;
  overview: SQL<string | null>;
}

export function seasonI18n(language: string): SeasonI18n {
  const locUser = alias(seasonLocalization, "loc_user_season");
  const locEn = alias(seasonLocalization, "loc_en_season");
  return {
    locUser,
    locEn,
    locUserJoin: asSql(
      and(eq(locUser.seasonId, season.id), eq(locUser.language, language)),
      "seasonI18n.locUserJoin",
    ),
    locEnJoin: asSql(
      and(eq(locEn.seasonId, season.id), eq(locEn.language, EN)),
      "seasonI18n.locEnJoin",
    ),
    name: sql<string | null>`COALESCE(NULLIF(TRIM(${locUser.name}), ''), NULLIF(TRIM(${locEn.name}), ''))`,
    overview: sql<string | null>`COALESCE(NULLIF(TRIM(${locUser.overview}), ''), NULLIF(TRIM(${locEn.overview}), ''))`,
  };
}
