/* -------------------------------------------------------------------------- */
/*  Media version repository                                                  */
/*                                                                            */
/*  One row per (source, serverItemId) observation. Each media can have       */
/*  multiple versions — e.g. Plex BluRay + Jellyfin 4K + Jellyfin 1080p       */
/*  dub-pt-BR all coexist. The unique index on (source, server_item_id)       */
/*  is the natural key; everything else is a plain upsert.                    */
/* -------------------------------------------------------------------------- */

import {
  and,
  eq,
  getTableColumns,
  ilike,
  inArray,
  isNull,
  lt,
  or,
  sql,
} from "drizzle-orm";
import type { Database } from "@canto/db/client";
import { mediaVersion, mediaVersionEpisode, media } from "@canto/db/schema";

import type { ServerSource } from "../../domain/sync/types";
import type {
  MediaSummary,
  MediaVersionEpisodeInsert,
  MediaVersionEpisodeRow,
  MediaVersionGroupCounts,
  MediaVersionInsert,
  MediaVersionRow,
  MediaVersionWithMedia,
} from "@canto/core/domain/media-servers/types/media-version";
import { mediaI18n } from "../shared/media-i18n";

/* -------------------------------------------------------------------------- */
/*  Row types — re-exported from the domain types module                     */
/* -------------------------------------------------------------------------- */

export type {
  MediaSummary,
  MediaVersionEpisodeInsert,
  MediaVersionEpisodeRow,
  MediaVersionGroupCounts,
  MediaVersionInsert,
  MediaVersionRow,
  MediaVersionWithMedia,
};

/* -------------------------------------------------------------------------- */
/*  Read APIs                                                                  */
/* -------------------------------------------------------------------------- */

export async function findMediaVersionById(db: Database, id: string) {
  return db.query.mediaVersion.findFirst({ where: eq(mediaVersion.id, id) });
}

export async function findMediaVersionsByMediaId(db: Database, mediaId: string) {
  return db
    .select()
    .from(mediaVersion)
    .where(eq(mediaVersion.mediaId, mediaId));
}

export async function findMediaVersionBySourceAndServerItemId(
  db: Database,
  source: ServerSource,
  serverItemId: string,
) {
  return db.query.mediaVersion.findFirst({
    where: and(
      eq(mediaVersion.source, source),
      eq(mediaVersion.serverItemId, serverItemId),
    ),
  });
}

export async function findMediaVersionsWithEpisodes(db: Database, mediaId: string) {
  return db.query.mediaVersion.findMany({
    where: eq(mediaVersion.mediaId, mediaId),
    with: { episodes: true },
  });
}

/**
 * Fetch every media_version row (optionally filtered by source/search) with
 * its anchor media row joined in. The router/service layer groups these by
 * media id, applies tab filters, and paginates — grouping in memory is fine
 * at the scale of a single user's server library.
 */
export async function fetchMediaVersionsWithMedia(
  db: Database,
  language: string,
  filters: { server?: ServerSource; search?: string },
): Promise<MediaVersionWithMedia[]> {
  const mi = mediaI18n(language);
  const conditions = [] as ReturnType<typeof eq>[];
  if (filters.server) conditions.push(eq(mediaVersion.source, filters.server));
  if (filters.search) {
    const needle = `%${filters.search}%`;
    const searchOr = or(
      ilike(mediaVersion.serverItemTitle, needle),
      sql`${mi.title} ILIKE ${needle}`,
    );
    if (searchOr !== undefined) conditions.push(searchOr);
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select({
      version: getTableColumns(mediaVersion),
      mediaId: media.id,
      mediaTitle: mi.title,
      mediaType: media.type,
      mediaYear: media.year,
      mediaPosterPath: mi.posterPath,
      mediaExternalId: media.externalId,
    })
    .from(mediaVersion)
    .leftJoin(media, eq(mediaVersion.mediaId, media.id))
    .leftJoin(mi.locUser, mi.locUserJoin)
    .leftJoin(mi.locEn, mi.locEnJoin)
    .where(where)
    .orderBy(mi.title, mediaVersion.serverItemTitle);

  return rows.map((row) => ({
    version: row.version as MediaVersionRow,
    media:
      row.mediaId && row.mediaTitle && row.mediaType
        ? {
            id: row.mediaId,
            title: row.mediaTitle,
            type: row.mediaType,
            year: row.mediaYear,
            posterPath: row.mediaPosterPath,
            externalId: row.mediaExternalId,
          }
        : null,
  }));
}

/**
 * Group-level counts used by the tab labels in the admin UI.
 *   - imported: matched media rows whose versions are ALL imported/skipped.
 *   - failed:   matched media rows with at least one failed version.
 *   - unmatched: standalone unmatched rows (media_id IS NULL).
 *   - all: sum of the three.
 */
export async function getMediaVersionCounts(db: Database): Promise<MediaVersionGroupCounts> {
  const result = await db.execute<{
    imported: number;
    failed: number;
    unmatched: number;
  }>(sql`
    WITH group_status AS (
      SELECT
        media_id,
        bool_or(result = 'failed') AS has_failed,
        bool_or(result = 'unmatched') AS has_unmatched
      FROM media_version
      WHERE media_id IS NOT NULL
      GROUP BY media_id
    )
    SELECT
      (SELECT COUNT(*)::int FROM group_status
         WHERE NOT has_failed AND NOT has_unmatched) AS imported,
      (SELECT COUNT(*)::int FROM group_status
         WHERE has_failed) AS failed,
      (SELECT COUNT(*)::int FROM media_version
         WHERE media_id IS NULL AND result = 'unmatched') AS unmatched
  `);
  const row = (Array.isArray(result) ? result[0] : (result as { rows?: Array<{ imported: number; failed: number; unmatched: number }> }).rows?.[0]) ?? {
    imported: 0,
    failed: 0,
    unmatched: 0,
  };
  const imported = Number(row.imported) || 0;
  const failed = Number(row.failed) || 0;
  const unmatched = Number(row.unmatched) || 0;
  return { all: imported + failed + unmatched, imported, failed, unmatched };
}

/* -------------------------------------------------------------------------- */
/*  Mutation APIs                                                              */
/* -------------------------------------------------------------------------- */

export async function updateMediaVersion(
  db: Database,
  id: string,
  data: Partial<MediaVersionInsert>,
) {
  await db
    .update(mediaVersion)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(mediaVersion.id, id));
}

export async function deleteMediaVersionById(db: Database, id: string): Promise<void> {
  await db.delete(mediaVersion).where(eq(mediaVersion.id, id));
}

/**
 * Atomic insert-or-update keyed by the natural key (source, server_item_id).
 * No merger logic: a single physical observation is represented by exactly
 * one row, so ON CONFLICT DO UPDATE is all we need.
 */
export async function upsertMediaVersion(
  db: Database,
  data: MediaVersionInsert,
): Promise<MediaVersionRow | undefined> {
  const now = new Date();
  const [row] = await db
    .insert(mediaVersion)
    .values({ ...data, updatedAt: now })
    .onConflictDoUpdate({
      target: [mediaVersion.source, mediaVersion.serverItemId],
      set: {
        mediaId: data.mediaId ?? null,
        serverLinkId: data.serverLinkId ?? null,
        serverItemTitle: data.serverItemTitle,
        serverItemPath: data.serverItemPath ?? null,
        serverItemYear: data.serverItemYear ?? null,
        resolution: data.resolution ?? null,
        videoCodec: data.videoCodec ?? null,
        audioCodec: data.audioCodec ?? null,
        container: data.container ?? null,
        fileSize: data.fileSize ?? null,
        bitrate: data.bitrate ?? null,
        durationMs: data.durationMs ?? null,
        hdr: data.hdr ?? null,
        primaryAudioLang: data.primaryAudioLang ?? null,
        audioLangs: data.audioLangs ?? null,
        subtitleLangs: data.subtitleLangs ?? null,
        tmdbId: data.tmdbId ?? null,
        result: data.result,
        reason: data.reason ?? null,
        syncedAt: data.syncedAt ?? now,
        updatedAt: now,
      },
    })
    .returning();
  return row;
}

/* -------------------------------------------------------------------------- */
/*  Episode helpers                                                            */
/* -------------------------------------------------------------------------- */

export async function createMediaVersionEpisodes(
  db: Database,
  episodes: MediaVersionEpisodeInsert[],
) {
  if (episodes.length === 0) return;
  await db.insert(mediaVersionEpisode).values(episodes);
}

export async function deleteMediaVersionEpisodesByVersionId(
  db: Database,
  versionId: string,
) {
  await db.delete(mediaVersionEpisode).where(eq(mediaVersionEpisode.versionId, versionId));
}

/* -------------------------------------------------------------------------- */
/*  Prune                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Delete stale media_version rows for the given source + serverLinks whose
 * synced_at is older than the cutoff. With one row per observation there is
 * no "side nulling" — just remove the rows outright. Callers scope this to
 * serverLinkIds so a scan of link A cannot wipe rows that belong to link B.
 */
export async function pruneStaleMediaVersions(
  db: Database,
  source: ServerSource,
  serverLinkIds: string[],
  cutoffDate: Date,
): Promise<void> {
  if (serverLinkIds.length === 0) return;
  await db
    .delete(mediaVersion)
    .where(
      and(
        eq(mediaVersion.source, source),
        inArray(mediaVersion.serverLinkId, serverLinkIds),
        lt(mediaVersion.syncedAt, cutoffDate),
      ),
    );

  // Also clean up any orphaned rows from this source that have no serverLink
  // (e.g. set-null from folderServerLink deletion) and older than cutoff.
  await db
    .delete(mediaVersion)
    .where(
      and(
        eq(mediaVersion.source, source),
        isNull(mediaVersion.serverLinkId),
        lt(mediaVersion.syncedAt, cutoffDate),
      ),
    );
}

/**
 * Bump synced_at on rows that were observed by the current scan but
 * deliberately skipped by a caller-side filter (e.g. the 6h TMDB rate-limit
 * filter in reverse-sync). Without this bump, `pruneStaleMediaVersions`
 * would delete them on the next run.
 */
export async function touchMediaVersionsSeen(
  db: Database,
  source: ServerSource,
  serverItemIds: string[],
  now: Date,
): Promise<void> {
  if (serverItemIds.length === 0) return;
  await db
    .update(mediaVersion)
    .set({ syncedAt: now })
    .where(
      and(
        eq(mediaVersion.source, source),
        inArray(mediaVersion.serverItemId, serverItemIds),
      ),
    );
}
