import { z } from "zod";

import { mediaType } from "./media";

// ── Shared primitives ──

export const mediaIdInput = z.object({
  mediaId: z.string(),
});
export type MediaIdInput = z.infer<typeof mediaIdInput>;

export const mediaIdUuidInput = z.object({
  mediaId: z.string().uuid(),
});
export type MediaIdUuidInput = z.infer<typeof mediaIdUuidInput>;

export const libraryFilterInput = z.object({
  q: z.string().trim().max(200).optional(),
  source: z.enum(["jellyfin", "plex", "trakt", "manual"]).optional(),
  sortBy: z
    .enum(["recently_watched", "name_asc", "name_desc", "year_desc", "year_asc"])
    .optional(),
  yearMin: z.number().optional(),
  yearMax: z.number().optional(),
  watchStatus: z.enum(["in_progress", "completed", "not_started"]).optional(),
  genreIds: z.array(z.number()).optional(),
  scoreMin: z.number().optional(),
  scoreMax: z.number().optional(),
  runtimeMin: z.number().optional(),
  runtimeMax: z.number().optional(),
  language: z.string().optional(),
  certification: z.string().optional(),
  tvStatus: z.string().optional(),
});
export type LibraryFilterInput = z.infer<typeof libraryFilterInput>;

// ── userMedia router inputs ──

export const getUserMediaInput = z.object({
  status: z.enum(["planned", "watching", "completed", "dropped"]).optional(),
  hasRating: z.boolean().optional(),
  isFavorite: z.boolean().optional(),
  isHidden: z.boolean().optional(),
  mediaType: mediaType.optional(),
  sortBy: z.enum(["updatedAt", "rating", "title", "year"]).default("updatedAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  limit: z.number().int().min(1).max(100).default(24),
  cursor: z.number().int().min(0).nullish(),
});
export type GetUserMediaInput = z.infer<typeof getUserMediaInput>;

export const getLibraryWatchNextInput = libraryFilterInput.extend({
  limit: z.number().int().min(1).max(100).default(24),
  cursor: z.number().int().min(0).nullish(),
  view: z.enum(["all", "continue", "watch_next"]).default("all"),
  mediaType: mediaType.optional(),
});
export type GetLibraryWatchNextInput = z.infer<typeof getLibraryWatchNextInput>;

// ── Continue Watching (focused replacement for getLibraryWatchNext view='continue')
//
// Cursor is a keyset on (lastWatchedAt, id) — Date is preserved across the
// wire by the superjson transformer configured on the tRPC root.
export const continueWatchingCursor = z
  .object({
    lastWatchedAt: z.coerce.date(),
    id: z.string(),
  })
  .nullish();
export type ContinueWatchingCursor = z.infer<typeof continueWatchingCursor>;

export const getContinueWatchingInput = libraryFilterInput.extend({
  limit: z.number().int().min(1).max(100).default(24),
  cursor: continueWatchingCursor,
  mediaType: mediaType.optional(),
});
export type GetContinueWatchingInput = z.infer<typeof getContinueWatchingInput>;

// ── Watch Next (focused replacement for getLibraryWatchNext view='watch_next')
export const getWatchNextInput = libraryFilterInput.extend({
  limit: z.number().int().min(1).max(100).default(24),
  cursor: z.number().int().min(0).nullish(),
  mediaType: mediaType.optional(),
});
export type GetWatchNextInput = z.infer<typeof getWatchNextInput>;

export const getUpcomingScheduleInput = libraryFilterInput.extend({
  limit: z.number().int().min(1).max(100).default(24),
  cursor: z.number().int().min(0).nullish(),
  mediaType: mediaType.optional(),
});
export type GetUpcomingScheduleInput = z.infer<typeof getUpcomingScheduleInput>;

export const getLibraryHistoryInput = libraryFilterInput.extend({
  limit: z.number().int().min(1).max(200).default(40),
  cursor: z.number().int().min(0).nullish(),
  mediaType: mediaType.optional(),
  completedOnly: z.boolean().optional(),
});
export type GetLibraryHistoryInput = z.infer<typeof getLibraryHistoryInput>;

export const getMediaReviewsInput = z.object({
  mediaId: z.string().uuid(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
  episodeId: z.string().uuid().optional(),
  sortBy: z.enum(["date", "rating"]).default("date"),
});
export type GetMediaReviewsInput = z.infer<typeof getMediaReviewsInput>;

export const getReviewByIdInput = z.object({
  reviewId: z.string().uuid(),
});
export type GetReviewByIdInput = z.infer<typeof getReviewByIdInput>;

export const getEpisodeReviewsInput = z.object({
  episodeId: z.string().uuid(),
});
export type GetEpisodeReviewsInput = z.infer<typeof getEpisodeReviewsInput>;

export const toggleFavoriteInput = z.object({
  mediaId: z.string(),
  isFavorite: z.boolean(),
});
export type ToggleFavoriteInput = z.infer<typeof toggleFavoriteInput>;

export const hideMediaInput = z.object({
  externalId: z.number(),
  provider: z.string().default("tmdb"),
  type: mediaType,
  title: z.string(),
  posterPath: z.string().nullable().optional(),
});
export type HideMediaInput = z.infer<typeof hideMediaInput>;

export const unhideMediaInput = z.object({
  externalId: z.number(),
  provider: z.string().default("tmdb"),
});
export type UnhideMediaInput = z.infer<typeof unhideMediaInput>;

export const getHiddenMediaInput = z.object({
  limit: z.number().int().min(1).max(100).default(24),
  cursor: z.number().int().min(0).nullish(),
});
export type GetHiddenMediaInput = z.infer<typeof getHiddenMediaInput>;

export const trackInput = z.object({
  mediaId: z.string(),
  status: z.enum(["none", "planned", "watching", "completed", "dropped"]),
});
export type TrackInput = z.infer<typeof trackInput>;

export const logWatchedInput = z.object({
  mediaId: z.string(),
  scope: z.enum(["movie", "show", "season", "episode"]).optional(),
  seasonNumber: z.number().int().min(0).optional(),
  episodeNumber: z.number().int().min(1).optional(),
  selectedEpisodeIds: z.array(z.string()).min(1).optional(),
  watchedAtMode: z
    .enum(["just_now", "release_date", "other_date", "unknown_date"])
    .default("just_now"),
  watchedAt: z.string().datetime().optional(),
  markDropped: z.boolean().default(false),
  rating: z.number().int().min(1).max(10).optional(),
  comment: z.string().max(5000).optional(),
});
export type LogWatchedInput = z.infer<typeof logWatchedInput>;

export const removeHistoryEntriesInput = z.object({
  mediaId: z.string(),
  entryIds: z.array(z.string()).min(1),
});
export type RemoveHistoryEntriesInput = z.infer<typeof removeHistoryEntriesInput>;
