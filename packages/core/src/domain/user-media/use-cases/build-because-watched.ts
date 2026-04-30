import type { Database } from "@canto/db/client";
import { findBecauseWatchedRecs } from "@canto/core/infra/recommendations/because-watched-repository";
import { findRecentlyCompletedMedia } from "@canto/core/infra/user-media/state-repository";
import type { WatchNextItem } from "@canto/core/domain/user-media/types/watch-next";

const MAX_COMPLETED_SOURCES = 5;
const RECS_PER_SOURCE = 3;

/**
 * Build "because you watched X" items for the Watch Next feed.
 *
 * Pipeline:
 * 1. Pull the user's most recent completions (explicit `userMediaState` +
 *    implicit movie playback completions). Capped at `MAX_COMPLETED_SOURCES`.
 * 2. For each source, fetch top-N recommendations from `media_recommendation`
 *    via a single window-function query. Excludes are applied at SQL level
 *    (library / lists / dropped / low-rated / already-completed).
 * 3. Map each rec to a `WatchNextItem` tagged `because_watched` with the
 *    source's title + poster in `becauseOf`. The item's `watchedAt` mirrors
 *    the source's completion timestamp so the merged Watch Next feed sorts
 *    these alongside next-episode items by recency.
 *
 * Items already represented by a next-episode entry must be filtered by the
 * caller — this builder doesn't know about that other source.
 */
export async function buildBecauseWatched(
  db: Database,
  userId: string,
  mediaType: "movie" | "show" | undefined,
  language: string,
): Promise<WatchNextItem[]> {
  const completed = await findRecentlyCompletedMedia(
    db,
    userId,
    language,
    undefined, // both signal-source types — filter the rec output, not the seed
    MAX_COMPLETED_SOURCES,
  );
  if (completed.length === 0) return [];

  const sourceIds = completed.map((c) => c.mediaId);
  const sourceById = new Map(completed.map((c) => [c.mediaId, c] as const));

  const recs = await findBecauseWatchedRecs(
    db,
    userId,
    sourceIds,
    mediaType,
    RECS_PER_SOURCE,
    language,
  );
  if (recs.length === 0) return [];

  // When two sources both recommend the same target, attribute the rec to
  // the more recent completion — that's the more compelling "because you
  // watched X" headline. Within a single source, keep the SQL-side
  // weighted-score rank.
  const recsByRecency = [...recs].sort((a, b) => {
    const aTime = sourceById.get(a.sourceMediaId)?.completedAt.getTime() ?? 0;
    const bTime = sourceById.get(b.sourceMediaId)?.completedAt.getTime() ?? 0;
    if (bTime !== aTime) return bTime - aTime;
    return a.rank - b.rank;
  });

  const items: WatchNextItem[] = [];
  const seen = new Set<string>();
  for (const rec of recsByRecency) {
    if (seen.has(rec.mediaId)) continue;
    seen.add(rec.mediaId);

    const source = sourceById.get(rec.sourceMediaId);
    if (!source) continue;

    items.push({
      id: `because-watched:${rec.sourceMediaId}:${rec.mediaId}`,
      kind: "because_watched",
      mediaId: rec.mediaId,
      mediaType: rec.type,
      title: rec.title,
      posterPath: rec.posterPath,
      backdropPath: rec.backdropPath,
      logoPath: rec.logoPath,
      overview: rec.overview,
      voteAverage: rec.voteAverage,
      genres: null,
      genreIds: rec.genreIds,
      trailerKey: rec.trailerKey,
      year: rec.year,
      externalId: rec.externalId,
      provider: rec.provider,
      source: "completion",
      progressSeconds: 0,
      durationSeconds: null,
      progressPercent: null,
      progressValue: null,
      progressTotal: null,
      progressUnit: null,
      watchedAt: source.completedAt,
      episode: null,
      fromLists: [],
      becauseOf: {
        mediaId: source.mediaId,
        title: source.title,
        posterPath: source.posterPath,
      },
    });
  }

  return items;
}
