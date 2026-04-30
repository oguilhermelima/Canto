/**
 * Branded id for the `tmdb_certification` table primary key. The natural key
 * is `(type, region, rating)`, but the table uses a surrogate UUID for the
 * primary index.
 */
export type TmdbCertificationId = string & {
  readonly __brand: "TmdbCertificationId";
};

/** Mirrors TMDB's `/certification/{type}/list` discriminator. */
export type TmdbCertificationType = "movie" | "tv";

/**
 * Domain entity for a `tmdb_certification` row. Catalog of valid
 * certifications per region, mirrored from TMDB and refreshed lazily by
 * `syncTmdbCertifications`.
 */
export interface TmdbCertification {
  id: TmdbCertificationId;
  type: TmdbCertificationType;
  region: string;
  rating: string;
  meaning: string | null;
  sortOrder: number;
  updatedAt: Date;
}

/** Upsert input. The adapter resolves conflicts on `(type, region, rating)`. */
export interface NewTmdbCertification {
  type: TmdbCertificationType;
  region: string;
  rating: string;
  meaning?: string | null;
  sortOrder: number;
}
