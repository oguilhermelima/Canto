import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  gte,
  ilike,
  inArray,
  lte,
  sql,
  type SQL,
} from "drizzle-orm";
import type { Database } from "@canto/db/client";
import {
  folderServerLink,
  episode,
  media,
  mediaFile,
  mediaTranslation,
  mediaVersion,
  mediaVideo,
  season,
  download,
  userConnection,
  userRecommendation,
} from "@canto/db/schema";
import type { ListInput } from "@canto/validators";
import { mediaI18n } from "../shared/media-i18n";

type MediaRow = typeof media.$inferSelect;

const withSeasonsAndEpisodes = {
  seasons: {
    orderBy: (s: any, { asc }: any) => [asc(s.number)],
    with: {
      episodes: {
        orderBy: (e: any, { asc }: any) => [asc(e.number)],
      },
    },
  },
} as const;

export async function findMediaById(db: Database, id: string) {
  return db.query.media.findFirst({
    where: eq(media.id, id),
  });
}

export async function findMediaByIdWithSeasons(db: Database, id: string) {
  return db.query.media.findFirst({
    where: eq(media.id, id),
    with: withSeasonsAndEpisodes,
  });
}

export async function findMediaByExternalId(
  db: Database,
  externalId: number,
  provider: string,
  type?: string,
) {
  return db.query.media.findFirst({
    where: type
      ? and(eq(media.externalId, externalId), eq(media.provider, provider), eq(media.type, type))
      : and(eq(media.externalId, externalId), eq(media.provider, provider)),
    with: withSeasonsAndEpisodes,
  });
}

/**
 * Find a media record by any cross-reference: externalId+provider, IMDB ID, or TVDB ID.
 * Prevents duplicates when a show has been replaced from TMDB→TVDB (or vice versa).
 * Returns the record with seasons if found by any reference.
 */
export async function findMediaByAnyReference(
  db: Database,
  externalId: number,
  provider: string,
  imdbId?: string,
  tvdbId?: number,
  type?: string,
) {
  // 1. Direct match by externalId + provider (+ type when available)
  const direct = await db.query.media.findFirst({
    where: type
      ? and(eq(media.externalId, externalId), eq(media.provider, provider), eq(media.type, type))
      : and(eq(media.externalId, externalId), eq(media.provider, provider)),
    with: withSeasonsAndEpisodes,
  });
  if (direct) return direct;

  // 2. Cross-reference by IMDB ID (most reliable for cross-provider matching)
  if (imdbId) {
    const byImdb = await db.query.media.findFirst({
      where: eq(media.imdbId, imdbId),
      with: withSeasonsAndEpisodes,
    });
    if (byImdb) return byImdb;
  }

  // 3. Cross-reference by TVDB ID
  if (tvdbId) {
    const byTvdb = await db.query.media.findFirst({
      where: eq(media.tvdbId, tvdbId),
      with: withSeasonsAndEpisodes,
    });
    if (byTvdb) return byTvdb;
  }

  // 4. If provider is TVDB, check if TMDB has this tvdbId stored
  if (provider === "tvdb") {
    const byTvdbRef = await db.query.media.findFirst({
      where: eq(media.tvdbId, externalId),
      with: withSeasonsAndEpisodes,
    });
    if (byTvdbRef) return byTvdbRef;
  }

  // 5. If provider is TMDB, check if a TVDB record has this as tvdbId cross-ref
  if (provider === "tmdb") {
    const byTmdbRef = await db.query.media.findFirst({
      where: and(eq(media.provider, "tvdb"), eq(media.tvdbId, externalId)),
      with: withSeasonsAndEpisodes,
    });
    if (byTmdbRef) return byTmdbRef;
  }

  return null;
}

export async function findEpisodeIdByMediaAndNumbers(
  db: Database,
  mediaId: string,
  seasonNumber: number,
  episodeNumber: number,
): Promise<string | null> {
  const [row] = await db
    .select({ id: episode.id })
    .from(episode)
    .innerJoin(season, eq(episode.seasonId, season.id))
    .where(
      and(
        eq(season.mediaId, mediaId),
        eq(season.number, seasonNumber),
        eq(episode.number, episodeNumber),
      ),
    )
    .limit(1);

  return row?.id ?? null;
}

export async function findEpisodeNumbersById(
  db: Database,
  episodeId: string,
): Promise<{ seasonNumber: number; episodeNumber: number } | null> {
  const [row] = await db
    .select({
      seasonNumber: season.number,
      episodeNumber: episode.number,
    })
    .from(episode)
    .innerJoin(season, eq(episode.seasonId, season.id))
    .where(eq(episode.id, episodeId))
    .limit(1);
  return row ?? null;
}

export async function updateMedia(
  db: Database,
  id: string,
  data: Partial<typeof media.$inferInsert>,
) {
  const [updated] = await db
    .update(media)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(media.id, id))
    .returning();
  return updated;
}

export async function deleteMedia(db: Database, id: string) {
  const [deleted] = await db.delete(media).where(eq(media.id, id)).returning();
  return deleted;
}

/**
 * Check if a media has no media_version rows and no torrents referencing it.
 * Optionally exclude a single version id (used when checking whether the
 * media would become orphaned after a version is deleted / re-pointed).
 */
export async function isMediaOrphaned(
  db: Database,
  mediaId: string,
  excludeVersionId?: string,
): Promise<boolean> {
  const versionWhere = excludeVersionId
    ? and(eq(mediaVersion.mediaId, mediaId), sql`${mediaVersion.id} != ${excludeVersionId}`)
    : eq(mediaVersion.mediaId, mediaId);
  const [[otherVersions], [downloads]] = await Promise.all([
    db.select({ count: count() }).from(mediaVersion).where(versionWhere),
    db.select({ count: count() }).from(download).where(eq(download.mediaId, mediaId)),
  ]);
  return (otherVersions?.count ?? 0) === 0 && (downloads?.count ?? 0) === 0;
}

export async function findLibraryExternalIds(db: Database) {
  return db.query.media.findMany({
    where: eq(media.inLibrary, true),
    columns: { externalId: true, provider: true },
  });
}

export async function findLibraryMediaBrief(db: Database, limit = 100) {
  return db.query.media.findMany({
    where: eq(media.inLibrary, true),
    columns: { id: true, externalId: true, provider: true, type: true },
    limit,
  });
}

export async function findLibraryStats(db: Database) {
  // 3 COUNTs collapsed into one scan via FILTER. Storage scans a different
  // table so it stays parallel.
  const [statsRows, [storageRow]] = await Promise.all([
    db
      .select({
        total: sql<number>`COUNT(*) FILTER (WHERE ${media.inLibrary} = true)`.mapWith(Number),
        movies: sql<number>`COUNT(*) FILTER (WHERE ${media.inLibrary} = true AND ${media.type} = 'movie')`.mapWith(Number),
        shows: sql<number>`COUNT(*) FILTER (WHERE ${media.inLibrary} = true AND ${media.type} = 'show')`.mapWith(Number),
      })
      .from(media),
    db
      .select({ totalBytes: sql<string>`COALESCE(SUM(${mediaFile.sizeBytes}), 0)` })
      .from(mediaFile),
  ]);

  const statsRow = statsRows[0];
  return {
    total: statsRow?.total ?? 0,
    movies: statsRow?.movies ?? 0,
    shows: statsRow?.shows ?? 0,
    storageBytes: BigInt(storageRow?.totalBytes ?? "0"),
  };
}

/* -------------------------------------------------------------------------- */
/*  Library listing (paginated + filtered)                                    */
/* -------------------------------------------------------------------------- */

function buildLibraryFilters(input: ListInput): SQL {
  const conditions: SQL[] = [eq(media.inLibrary, true)];

  if (input.type) conditions.push(eq(media.type, input.type));

  if (input.genre) {
    conditions.push(
      sql`${media.genres}::jsonb @> ${JSON.stringify([input.genre])}::jsonb`,
    );
  }

  if (input.status) conditions.push(eq(media.status, input.status));
  if (input.yearMin) conditions.push(gte(media.year, input.yearMin));
  if (input.yearMax) conditions.push(lte(media.year, input.yearMax));
  if (input.language) conditions.push(eq(media.originalLanguage, input.language));
  if (input.scoreMin) conditions.push(gte(media.voteAverage, input.scoreMin));
  if (input.scoreMax) conditions.push(lte(media.voteAverage, input.scoreMax));
  if (input.runtimeMax) conditions.push(lte(media.runtime, input.runtimeMax));
  if (input.contentRating) conditions.push(eq(media.contentRating, input.contentRating));

  if (input.network) {
    conditions.push(
      sql`${media.networks}::jsonb @> ${JSON.stringify([input.network])}::jsonb`,
    );
  }

  if (input.provider) conditions.push(eq(media.provider, input.provider));
  if (input.search) conditions.push(ilike(media.title, `%${input.search}%`));

  if (input.downloaded !== undefined) {
    if (input.downloaded) {
      conditions.push(
        sql`EXISTS (SELECT 1 FROM media_file WHERE media_file.media_id = ${media.id})`,
      );
    } else {
      conditions.push(
        sql`NOT EXISTS (SELECT 1 FROM media_file WHERE media_file.media_id = ${media.id})`,
      );
    }
  }

  return and(...conditions)!;
}

function buildOrderBy(sortBy: ListInput["sortBy"], sortOrder: ListInput["sortOrder"]) {
  const orderFn = sortOrder === "asc" ? asc : desc;
  switch (sortBy) {
    case "title": return [orderFn(media.title)];
    case "year": return [orderFn(media.year)];
    case "voteAverage": return [orderFn(media.voteAverage)];
    case "popularity": return [orderFn(media.popularity)];
    case "releaseDate": return [orderFn(media.releaseDate)];
    case "addedAt":
    default: return [orderFn(media.addedAt)];
  }
}

/* -------------------------------------------------------------------------- */
/*  Reconcile in_library based on anchoring media_versions                     */
/* -------------------------------------------------------------------------- */

/**
 * Flip `in_library = false` for any media that is currently marked in the
 * library but has no remaining media_version rows AND is not present in the
 * local download folder (`downloaded = false`).
 *
 * Runs at the tail of a reverse-sync cycle: once all scanners have upserted
 * observations and the stale prune has removed unreachable rows, any media
 * with zero media_version anchors is no longer on any server.
 */
export async function reconcileMediaInLibrary(db: Database): Promise<number> {
  const result = await db.execute(sql`
    UPDATE ${media}
    SET in_library = false, updated_at = NOW()
    WHERE in_library = true
      AND downloaded = false
      AND NOT EXISTS (
        SELECT 1 FROM ${mediaVersion}
        WHERE ${mediaVersion.mediaId} = ${media.id}
      )
  `);
  return (result as unknown as { rowCount?: number }).rowCount ?? 0;
}

export async function listLibraryMedia(
  db: Database,
  input: ListInput,
  language: string,
  userId?: string,
): Promise<{ items: MediaRow[]; total: number; page: number; pageSize: number }> {
  const page = input.cursor ?? input.page;
  const pageSize = input.pageSize;
  const offset = (page - 1) * pageSize;

  let where: SQL = buildLibraryFilters(input);

  if (userId) {
    // Get which providers the user has connected accounts for.
    // If none → return empty (user hasn't linked any media server account yet).
    const connectedProviders = await db
      .select({ provider: userConnection.provider })
      .from(userConnection)
      .where(and(eq(userConnection.userId, userId), eq(userConnection.enabled, true)));

    if (connectedProviders.length === 0) {
      return { items: [], total: 0, page, pageSize };
    }

    // Show media that has a media_version row from any provider the user has
    // connected to. Robust across which user triggered the last sync run.
    const providerValues = connectedProviders.map((c) => c.provider) as Array<"jellyfin" | "plex">;
    const accessibleMediaIds = db
      .select({ id: mediaVersion.mediaId })
      .from(mediaVersion)
      .innerJoin(folderServerLink, eq(mediaVersion.serverLinkId, folderServerLink.id))
      .where(
        and(
          inArray(mediaVersion.result, ["imported", "skipped"]),
          inArray(folderServerLink.serverType, providerValues),
        ),
      );

    where = and(where, sql`${media.id} IN (${accessibleMediaIds})`)!;
  }

  const orderBy = buildOrderBy(input.sortBy, input.sortOrder);

  // Overlay translations inline via LEFT JOIN on `media_translation`. For
  // en-US users (or any language with no row) COALESCE returns the raw column
  // and the join is a no-op. The previous shape did a separate
  // `batchMediaTranslations` per page in JS, costing a second round trip.
  const mi = mediaI18n(language);
  const mediaCols = getTableColumns(media);

  const [rawItems, [totalRow]] = await Promise.all([
    db
      .select({
        // Source-row passthrough — every column on the media row stays
        // available so the caller still sees a `MediaRow`.
        ...mediaCols,
        title: mi.title,
        overview: mi.overview,
        posterPath: mi.posterPath,
        logoPath: mi.logoPath,
        tagline: mi.tagline,
      })
      .from(media)
      .leftJoin(mediaTranslation, mi.join)
      .where(where)
      .orderBy(...orderBy)
      .limit(pageSize)
      .offset(offset),
    db.select({ total: count() }).from(media).where(where),
  ]);

  // The select shape matches `MediaRow` field-for-field — drizzle infers it
  // from `getTableColumns(media)` plus the SQL-typed overlay fields.
  const items = rawItems as MediaRow[];

  return { items, total: totalRow?.total ?? 0, page, pageSize };
}

/**
 * Shows marked for continuous-download RSS monitoring. Returned shape matches
 * what the RSS matcher needs (id/title/externalId/provider/type) and what
 * the scoring layer needs to derive media flavor (origin country, original
 * language, genres) for tier-aware release-group classification.
 */
export async function findMonitoredShowsForRss(db: Database) {
  return db
    .select({
      id: media.id,
      title: media.title,
      externalId: media.externalId,
      provider: media.provider,
      type: media.type,
      originCountry: media.originCountry,
      originalLanguage: media.originalLanguage,
      genres: media.genres,
      genreIds: media.genreIds,
    })
    .from(media)
    .where(and(eq(media.type, "show"), eq(media.continuousDownload, true)));
}

/**
 * Media currently in the user library that is marked as downloaded — used by
 * the `validate-downloads` job to check file-system presence.
 */
export async function findDownloadedLibraryMedia(
  db: Database,
): Promise<Array<{ id: string; title: string }>> {
  return db.query.media.findMany({
    where: and(eq(media.downloaded, true), eq(media.inLibrary, true)),
    columns: { id: true, title: true },
  });
}

/**
 * Imported media_file rows for a given media — `id` and `filePath` only.
 * Used by the `validate-downloads` job.
 */
export async function findImportedFilesForMedia(
  db: Database,
  mediaId: string,
): Promise<Array<{ id: string; filePath: string | null }>> {
  return db
    .select({ id: mediaFile.id, filePath: mediaFile.filePath })
    .from(mediaFile)
    .where(and(eq(mediaFile.mediaId, mediaId), eq(mediaFile.status, "imported")));
}

/**
 * Media present in an active user recommendation that is missing a logo or
 * video extras and hasn't had extras refreshed in the last `staleDays` days.
 * Drives the `backfill-extras` scheduled job.
 */
export async function findMediaNeedingExtrasBackfill(
  db: Database,
  opts: { staleDays: number },
): Promise<Array<{ id: string; title: string }>> {
  return db
    .selectDistinctOn([media.id], { id: media.id, title: media.title })
    .from(userRecommendation)
    .innerJoin(media, sql`${media.id} = ${userRecommendation.mediaId}`)
    .where(
      sql`${userRecommendation.active} = true
        AND (${media.extrasUpdatedAt} IS NULL OR ${media.extrasUpdatedAt} < now() - interval '1 day' * ${opts.staleDays})
        AND (
          ${media.logoPath} IS NULL
          OR NOT EXISTS (SELECT 1 FROM ${mediaVideo} WHERE ${mediaVideo.mediaId} = ${media.id})
        )`,
    );
}
