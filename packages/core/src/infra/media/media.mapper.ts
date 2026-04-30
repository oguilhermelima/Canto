import type {
  LibraryExternalIdRef,
  LibraryMediaBrief,
  Media,
  MediaId,
  MediaProvider,
  MediaSummary,
  MediaType,
  NewMedia,
  UpdateMediaInput,
} from "@canto/core/domain/media/types/media";
import type { media } from "@canto/db/schema";

type Row = typeof media.$inferSelect;
type Insert = typeof media.$inferInsert;

function toType(value: string): MediaType {
  return value === "show" ? "show" : "movie";
}

function toProvider(value: string): MediaProvider {
  if (value === "tvdb") return "tvdb";
  if (value === "anilist") return "anilist";
  return "tmdb";
}

export function toDomain(row: Row): Media {
  return {
    id: row.id as MediaId,
    type: toType(row.type),
    externalId: row.externalId,
    provider: toProvider(row.provider),
    originalTitle: row.originalTitle,
    releaseDate: row.releaseDate,
    year: row.year,
    lastAirDate: row.lastAirDate,
    status: row.status,
    genres: row.genres ?? null,
    genreIds: row.genreIds ?? null,
    contentRating: row.contentRating,
    originalLanguage: row.originalLanguage,
    spokenLanguages: row.spokenLanguages ?? null,
    originCountry: row.originCountry ?? null,
    voteAverage: row.voteAverage,
    voteCount: row.voteCount,
    popularity: row.popularity,
    runtime: row.runtime,
    backdropPath: row.backdropPath,
    imdbId: row.imdbId,
    tvdbId: row.tvdbId,
    overrideProviderFor: row.overrideProviderFor,
    numberOfSeasons: row.numberOfSeasons,
    numberOfEpisodes: row.numberOfEpisodes,
    inProduction: row.inProduction,
    networks: row.networks ?? null,
    budget: row.budget,
    revenue: row.revenue,
    collection: row.collection ?? null,
    productionCompanies: row.productionCompanies ?? null,
    productionCountries: row.productionCountries ?? null,
    libraryId: row.libraryId,
    inLibrary: row.inLibrary,
    downloaded: row.downloaded,
    libraryPath: row.libraryPath,
    addedAt: row.addedAt,
    continuousDownload: row.continuousDownload,
    nextAirDate: row.nextAirDate,
    airsTime: row.airsTime,
    downloadProfileId: row.downloadProfileId,
    processingStatus: row.processingStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toRow(input: NewMedia): Insert {
  return {
    type: input.type,
    externalId: input.externalId,
    provider: input.provider,
    originalTitle: input.originalTitle ?? null,
    releaseDate: input.releaseDate ?? null,
    year: input.year ?? null,
    lastAirDate: input.lastAirDate ?? null,
    status: input.status ?? null,
    genres: input.genres ?? [],
    genreIds: input.genreIds ?? [],
    contentRating: input.contentRating ?? null,
    originalLanguage: input.originalLanguage ?? null,
    spokenLanguages: input.spokenLanguages ?? null,
    originCountry: input.originCountry ?? null,
    voteAverage: input.voteAverage ?? null,
    voteCount: input.voteCount ?? null,
    popularity: input.popularity ?? null,
    runtime: input.runtime ?? null,
    backdropPath: input.backdropPath ?? null,
    imdbId: input.imdbId ?? null,
    tvdbId: input.tvdbId ?? null,
    overrideProviderFor: input.overrideProviderFor ?? null,
    numberOfSeasons: input.numberOfSeasons ?? null,
    numberOfEpisodes: input.numberOfEpisodes ?? null,
    inProduction: input.inProduction ?? null,
    networks: input.networks ?? null,
    budget: input.budget ?? null,
    revenue: input.revenue ?? null,
    collection: input.collection ?? null,
    productionCompanies: input.productionCompanies ?? null,
    productionCountries: input.productionCountries ?? null,
    libraryId: input.libraryId ?? null,
    ...(input.inLibrary !== undefined && { inLibrary: input.inLibrary }),
    ...(input.downloaded !== undefined && { downloaded: input.downloaded }),
    libraryPath: input.libraryPath ?? null,
    addedAt: input.addedAt ?? null,
    ...(input.continuousDownload !== undefined && {
      continuousDownload: input.continuousDownload,
    }),
    nextAirDate: input.nextAirDate ?? null,
    airsTime: input.airsTime ?? null,
    downloadProfileId: input.downloadProfileId ?? null,
    ...(input.processingStatus !== undefined && {
      processingStatus: input.processingStatus,
    }),
  };
}

/**
 * Build a partial update payload. Every field is checked for explicit
 * `undefined` so callers can null-out optional columns intentionally
 * (e.g. setting `libraryPath: null` to clear it).
 */
export function toUpdateRow(input: UpdateMediaInput): Partial<Insert> {
  const out: Partial<Insert> = {};
  if (input.type !== undefined) out.type = input.type;
  if (input.externalId !== undefined) out.externalId = input.externalId;
  if (input.provider !== undefined) out.provider = input.provider;
  if (input.originalTitle !== undefined) out.originalTitle = input.originalTitle;
  if (input.releaseDate !== undefined) out.releaseDate = input.releaseDate;
  if (input.year !== undefined) out.year = input.year;
  if (input.lastAirDate !== undefined) out.lastAirDate = input.lastAirDate;
  if (input.status !== undefined) out.status = input.status;
  if (input.genres !== undefined) out.genres = input.genres;
  if (input.genreIds !== undefined) out.genreIds = input.genreIds;
  if (input.contentRating !== undefined) out.contentRating = input.contentRating;
  if (input.originalLanguage !== undefined)
    out.originalLanguage = input.originalLanguage;
  if (input.spokenLanguages !== undefined)
    out.spokenLanguages = input.spokenLanguages;
  if (input.originCountry !== undefined) out.originCountry = input.originCountry;
  if (input.voteAverage !== undefined) out.voteAverage = input.voteAverage;
  if (input.voteCount !== undefined) out.voteCount = input.voteCount;
  if (input.popularity !== undefined) out.popularity = input.popularity;
  if (input.runtime !== undefined) out.runtime = input.runtime;
  if (input.backdropPath !== undefined) out.backdropPath = input.backdropPath;
  if (input.imdbId !== undefined) out.imdbId = input.imdbId;
  if (input.tvdbId !== undefined) out.tvdbId = input.tvdbId;
  if (input.overrideProviderFor !== undefined)
    out.overrideProviderFor = input.overrideProviderFor;
  if (input.numberOfSeasons !== undefined)
    out.numberOfSeasons = input.numberOfSeasons;
  if (input.numberOfEpisodes !== undefined)
    out.numberOfEpisodes = input.numberOfEpisodes;
  if (input.inProduction !== undefined) out.inProduction = input.inProduction;
  if (input.networks !== undefined) out.networks = input.networks;
  if (input.budget !== undefined) out.budget = input.budget;
  if (input.revenue !== undefined) out.revenue = input.revenue;
  if (input.collection !== undefined) out.collection = input.collection;
  if (input.productionCompanies !== undefined)
    out.productionCompanies = input.productionCompanies;
  if (input.productionCountries !== undefined)
    out.productionCountries = input.productionCountries;
  if (input.libraryId !== undefined) out.libraryId = input.libraryId;
  if (input.inLibrary !== undefined) out.inLibrary = input.inLibrary;
  if (input.downloaded !== undefined) out.downloaded = input.downloaded;
  if (input.libraryPath !== undefined) out.libraryPath = input.libraryPath;
  if (input.addedAt !== undefined) out.addedAt = input.addedAt;
  if (input.continuousDownload !== undefined)
    out.continuousDownload = input.continuousDownload;
  if (input.nextAirDate !== undefined) out.nextAirDate = input.nextAirDate;
  if (input.airsTime !== undefined) out.airsTime = input.airsTime;
  if (input.downloadProfileId !== undefined)
    out.downloadProfileId = input.downloadProfileId;
  if (input.processingStatus !== undefined)
    out.processingStatus = input.processingStatus;
  return out;
}

/**
 * Slim summary used by listings before localization overlay. The full
 * `MediaSummary` shape includes a `posterPath` field — sourced from the
 * legacy `media.poster_path` column where present, but post-1C-δ this
 * lives on `media_localization`. Callers that need the localized version
 * should use the listing-port reads (Wave 9B) instead of `toSummary`.
 */
export function toSummary(row: Row): MediaSummary {
  return {
    id: row.id as MediaId,
    type: toType(row.type),
    externalId: row.externalId,
    provider: toProvider(row.provider),
    year: row.year,
    voteAverage: row.voteAverage,
    posterPath: null,
    backdropPath: row.backdropPath,
  };
}

export function toLibraryMediaBrief(row: {
  id: string;
  externalId: number;
  provider: string;
  type: string;
}): LibraryMediaBrief {
  return {
    id: row.id as MediaId,
    externalId: row.externalId,
    provider: toProvider(row.provider),
    type: toType(row.type),
  };
}

export function toLibraryExternalIdRef(row: {
  externalId: number;
  provider: string;
}): LibraryExternalIdRef {
  return {
    externalId: row.externalId,
    provider: toProvider(row.provider),
  };
}
