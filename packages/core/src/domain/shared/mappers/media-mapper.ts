import type { NormalizedMedia, NormalizedSeason } from "@canto/providers";

/** Shape a NormalizedMedia (live fetch result) into a DB-compatible response object */
export function normalizedMediaToResponse(m: NormalizedMedia, tvdbSeasons?: NormalizedSeason[]) {
  return {
    ...m,
    overview: m.overview ?? null,
    tagline: m.tagline ?? null,
    originalTitle: m.originalTitle ?? null,
    releaseDate: m.releaseDate ?? null,
    lastAirDate: m.lastAirDate ?? null,
    status: m.status ?? null,
    contentRating: m.contentRating ?? null,
    originalLanguage: m.originalLanguage ?? null,
    posterPath: m.posterPath ?? null,
    backdropPath: m.backdropPath ?? null,
    logoPath: m.logoPath ?? null,
    imdbId: m.imdbId ?? null,
    tvdbId: m.tvdbId ?? null,
    voteAverage: m.voteAverage ?? null,
    voteCount: m.voteCount ?? null,
    popularity: m.popularity ?? null,
    runtime: m.runtime ?? null,
    year: m.year ?? null,
    numberOfSeasons: m.numberOfSeasons ?? null,
    numberOfEpisodes: m.numberOfEpisodes ?? null,
    inProduction: m.inProduction ?? null,
    budget: m.budget ?? null,
    revenue: m.revenue ?? null,
    collection: m.collection ?? null,
    id: "",
    inLibrary: false,
    downloaded: false,
    libraryId: null as string | null,
    libraryPath: null as string | null,
    addedAt: null as Date | null,
    continuousDownload: false,
    processingStatus: "ready",
    downloadProfileId: null as string | null,
    createdAt: new Date(),
    updatedAt: new Date(),
    nextAirDate: m.nextAirDate ?? null,
    seasons: (tvdbSeasons ?? m.seasons)?.map((s, i) => ({
      id: `temp-season-${i}`,
      mediaId: "",
      number: s.number,
      externalId: s.externalId ?? null,
      name: s.name ?? null,
      overview: s.overview ?? null,
      airDate: s.airDate ?? null,
      posterPath: s.posterPath ?? null,
      episodeCount: s.episodeCount ?? s.episodes?.length ?? null,
      seasonType: s.seasonType ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
      episodes: s.episodes?.map((e, j) => ({
        id: `temp-episode-${i}-${j}`,
        seasonId: `temp-season-${i}`,
        number: e.number,
        externalId: e.externalId ?? null,
        title: e.title ?? null,
        overview: e.overview ?? null,
        airDate: e.airDate ?? null,
        runtime: e.runtime ?? null,
        stillPath: e.stillPath ?? null,
        voteAverage: e.voteAverage ?? null,
        voteCount: e.voteCount ?? null,
        absoluteNumber: e.absoluteNumber ?? null,
        finaleType: e.finaleType ?? null,
        episodeType: e.episodeType ?? null,
        crew: e.crew ?? null,
        guestStars: e.guestStars ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })) ?? [],
    })) ?? [],
  };
}

/** Map a media/recommendation row to the standard frontend shape */
export function mapPoolItem(item: {
  id?: string;
  externalId: number;
  provider?: string | null;
  mediaType?: string;
  type?: string;
  title: string;
  overview?: string | null;
  posterPath?: string | null;
  backdropPath?: string | null;
  logoPath?: string | null;
  trailerKey?: string | null;
  releaseDate?: string | Date | null;
  voteAverage?: number | null;
  genres?: string[] | null;
  genreIds?: number[] | null;
}) {
  return {
    id: item.id ?? null,
    externalId: item.externalId,
    provider: item.provider ?? "tmdb",
    type: (item.mediaType ?? item.type) as "movie" | "show",
    title: item.title,
    overview: item.overview ?? undefined,
    posterPath: item.posterPath ?? null,
    backdropPath: item.backdropPath ?? null,
    logoPath: item.logoPath ?? null,
    trailerKey: item.trailerKey ?? null,
    year: item.releaseDate
      ? new Date(typeof item.releaseDate === "string" ? item.releaseDate : item.releaseDate).getFullYear()
      : undefined,
    voteAverage: item.voteAverage ?? undefined,
    genres: item.genres ?? [],
    genreIds: item.genreIds ?? [],
  };
}
