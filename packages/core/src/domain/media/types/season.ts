import type { Episode } from "@canto/core/domain/media/types/episode";
import type { MediaId } from "@canto/core/domain/media/types/media";

/** Branded id for the `season` table primary key. */
export type SeasonId = string & { readonly __brand: "SeasonId" };

/**
 * Domain entity for a season row. Localized fields (`name`, `overview`,
 * `posterPath`) on the base `season` table are pre-1C-δ legacy storage —
 * the canonical localized values now live on `season_localization`. Reading
 * via the base columns is still valid for callers that don't care about
 * user language.
 */
export interface Season {
  id: SeasonId;
  mediaId: MediaId;
  number: number;
  externalId: number | null;
  name: string | null;
  overview: string | null;
  airDate: string | null;
  posterPath: string | null;
  episodeCount: number | null;
  seasonType: string | null;
  voteAverage: number | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Insert shape — mediaId + number are required (composite uniqueness). */
export interface NewSeason {
  mediaId: MediaId | string;
  number: number;
  externalId?: number | null;
  name?: string | null;
  overview?: string | null;
  airDate?: string | null;
  posterPath?: string | null;
  episodeCount?: number | null;
  seasonType?: string | null;
  voteAverage?: number | null;
}

/** Read projection: a season row with its episodes inlined (sorted by
 *  episode number). Used by `findMediaByIdWithSeasons`. */
export interface SeasonWithEpisodes extends Season {
  episodes: Episode[];
}
