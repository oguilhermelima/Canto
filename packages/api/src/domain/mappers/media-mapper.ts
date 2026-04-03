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
