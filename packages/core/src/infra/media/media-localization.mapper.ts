import type { MediaId } from "@canto/core/domain/media/types/media";
import type {
  LocalizationSource,
  MediaLocalization,
  NewMediaLocalization,
} from "@canto/core/domain/media/types/media-localization";
import type { mediaLocalization } from "@canto/db/schema";

type Row = typeof mediaLocalization.$inferSelect;
type Insert = typeof mediaLocalization.$inferInsert;

function toSource(value: string): LocalizationSource {
  if (value === "tvdb") return "tvdb";
  if (value === "manual") return "manual";
  if (value === "original") return "original";
  return "tmdb";
}

export function toDomain(row: Row): MediaLocalization {
  return {
    mediaId: row.mediaId as MediaId,
    language: row.language,
    title: row.title,
    overview: row.overview,
    tagline: row.tagline,
    posterPath: row.posterPath,
    logoPath: row.logoPath,
    trailerKey: row.trailerKey,
    source: toSource(row.source),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toRow(input: NewMediaLocalization, now: Date = new Date()): Insert {
  return {
    mediaId: input.mediaId,
    language: input.language,
    title: input.title,
    overview: input.overview ?? null,
    tagline: input.tagline ?? null,
    posterPath: input.posterPath ?? null,
    logoPath: input.logoPath ?? null,
    trailerKey: input.trailerKey ?? null,
    source: input.source,
    createdAt: now,
    updatedAt: now,
  };
}
