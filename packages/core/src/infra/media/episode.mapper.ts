import type {
  Episode,
  EpisodeId,
  EpisodePatch,
  NewEpisode,
} from "@canto/core/domain/media/types/episode";
import type { SeasonId } from "@canto/core/domain/media/types/season";
import type { episode } from "@canto/db/schema";

type Row = typeof episode.$inferSelect;
type Insert = typeof episode.$inferInsert;

export function toDomain(row: Row): Episode {
  return {
    id: row.id as EpisodeId,
    seasonId: row.seasonId as SeasonId,
    number: row.number,
    externalId: row.externalId,
    title: row.title,
    overview: row.overview,
    airDate: row.airDate,
    runtime: row.runtime,
    stillPath: row.stillPath,
    voteAverage: row.voteAverage,
    voteCount: row.voteCount,
    absoluteNumber: row.absoluteNumber,
    finaleType: row.finaleType,
    episodeType: row.episodeType,
    crew: row.crew ?? null,
    guestStars: row.guestStars ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toRow(input: NewEpisode): Insert {
  return {
    seasonId: input.seasonId,
    number: input.number,
    externalId: input.externalId ?? null,
    title: input.title ?? null,
    overview: input.overview ?? null,
    airDate: input.airDate ?? null,
    runtime: input.runtime ?? null,
    stillPath: input.stillPath ?? null,
    voteAverage: input.voteAverage ?? null,
    voteCount: input.voteCount ?? null,
    absoluteNumber: input.absoluteNumber ?? null,
    finaleType: input.finaleType ?? null,
    episodeType: input.episodeType ?? null,
    crew: input.crew ?? null,
    guestStars: input.guestStars ?? null,
  };
}

export function toPatchRow(patch: EpisodePatch): Partial<Insert> {
  const out: Partial<Insert> = {};
  if (patch.externalId !== undefined) out.externalId = patch.externalId;
  if (patch.title !== undefined) out.title = patch.title;
  if (patch.overview !== undefined) out.overview = patch.overview;
  if (patch.airDate !== undefined) out.airDate = patch.airDate;
  if (patch.runtime !== undefined) out.runtime = patch.runtime;
  if (patch.stillPath !== undefined) out.stillPath = patch.stillPath;
  if (patch.voteAverage !== undefined) out.voteAverage = patch.voteAverage;
  if (patch.voteCount !== undefined) out.voteCount = patch.voteCount;
  if (patch.absoluteNumber !== undefined) out.absoluteNumber = patch.absoluteNumber;
  if (patch.finaleType !== undefined) out.finaleType = patch.finaleType;
  if (patch.episodeType !== undefined) out.episodeType = patch.episodeType;
  if (patch.crew !== undefined) out.crew = patch.crew;
  if (patch.guestStars !== undefined) out.guestStars = patch.guestStars;
  return out;
}
