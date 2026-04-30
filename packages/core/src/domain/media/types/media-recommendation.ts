import type { MediaId } from "@canto/core/domain/media/types/media";

/** Branded id for the `media_recommendation` junction table primary key. */
export type MediaRecommendationId = string & {
  readonly __brand: "MediaRecommendationId";
};

/**
 * Discriminator on the junction row. `recommendation` and `similar` map to
 * TMDB's two distinct endpoints; we persist both so the detail screen can
 * carve the lists separately.
 */
export type RecommendationSourceType = "recommendation" | "similar" | string;

/**
 * Junction-row entity. Each row links a `mediaId` (the recommended item) back
 * to a `sourceMediaId` (the media the user is currently viewing) — mirrors
 * the `media_recommendation` table 1:1. The unique index covers
 * `(mediaId, sourceMediaId)` so duplicate insertion is a no-op.
 */
export interface MediaRecommendation {
  id: MediaRecommendationId;
  mediaId: MediaId;
  sourceMediaId: MediaId;
  sourceType: RecommendationSourceType;
  createdAt: Date;
}

/** Insert input. `id` + `createdAt` are populated by the database. */
export interface NewMediaRecommendation {
  mediaId: MediaId | string;
  sourceMediaId: MediaId | string;
  sourceType: RecommendationSourceType;
}
