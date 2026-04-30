import type { Episode, EpisodeId } from "@canto/core/domain/media/types/episode";
import type { MediaId } from "@canto/core/domain/media/types/media";
import type {
  NewSeason,
  Season,
  SeasonId,
  SeasonWithEpisodes,
} from "@canto/core/domain/media/types/season";
import type { season } from "@canto/db/schema";

import { toDomain as episodeToDomain } from "@canto/core/infra/media/episode.mapper";

type Row = typeof season.$inferSelect;
type Insert = typeof season.$inferInsert;
type EpisodeRow = Parameters<typeof episodeToDomain>[0];

export function toDomain(row: Row): Season {
  return {
    id: row.id as SeasonId,
    mediaId: row.mediaId as MediaId,
    number: row.number,
    externalId: row.externalId,
    name: row.name,
    overview: row.overview,
    airDate: row.airDate,
    posterPath: row.posterPath,
    episodeCount: row.episodeCount,
    seasonType: row.seasonType,
    voteAverage: row.voteAverage,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Hydrate a season row plus its inlined episodes (already loaded by the
 * `with: { episodes }` relation). Drizzle returns episodes as an array on
 * the parent row when the query includes the relation.
 */
export function toDomainWithEpisodes(
  row: Row & { episodes: EpisodeRow[] },
): SeasonWithEpisodes {
  return {
    ...toDomain(row),
    episodes: row.episodes.map(episodeToDomain) as Episode[],
  };
}

export function toRow(input: NewSeason): Insert {
  return {
    mediaId: input.mediaId,
    number: input.number,
    externalId: input.externalId ?? null,
    name: input.name ?? null,
    overview: input.overview ?? null,
    airDate: input.airDate ?? null,
    posterPath: input.posterPath ?? null,
    episodeCount: input.episodeCount ?? null,
    seasonType: input.seasonType ?? null,
    voteAverage: input.voteAverage ?? null,
  };
}

export type { EpisodeId };
