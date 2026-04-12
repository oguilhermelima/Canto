/**
 * Normalized item that every data source produces.
 * The DynamicSection component maps this to the right visual component.
 */
export interface SectionItem {
  externalId: number | string;
  provider: string;
  type: "movie" | "show";
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  logoPath?: string | null;
  trailerKey?: string | null;
  year?: number | null;
  voteAverage?: number | null;
  overview?: string | null;
  popularity?: number;
  releaseDate?: string;
  genres?: string[];
  genreIds?: number[];
}
