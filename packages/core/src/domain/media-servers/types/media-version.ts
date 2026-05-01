import type { mediaVersion, mediaVersionEpisode } from "@canto/db/schema";

/**
 * Row-level shapes of `media_version` and `media_version_episode`. These mirror
 * the drizzle-inferred select/insert types so domain code can reason about
 * them without touching infra. Repository adapters return the same shapes.
 */
export type MediaVersionRow = typeof mediaVersion.$inferSelect;
export type MediaVersionInsert = typeof mediaVersion.$inferInsert;
export type MediaVersionEpisodeRow = typeof mediaVersionEpisode.$inferSelect;
export type MediaVersionEpisodeInsert = typeof mediaVersionEpisode.$inferInsert;

/** Subset of `media` columns surfaced by joined media_version reads. */
export interface MediaSummary {
  id: string;
  title: string;
  type: string;
  year: number | null;
  posterPath: string | null;
  externalId: number | null;
}

export interface MediaVersionWithMedia {
  version: MediaVersionRow;
  media: MediaSummary | null;
}

export interface MediaVersionGroupCounts {
  all: number;
  imported: number;
  unmatched: number;
  failed: number;
}
