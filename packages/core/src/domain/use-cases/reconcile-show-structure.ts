import type { Database } from "@canto/db/client";
import { eq, sql } from "drizzle-orm";
import {
  season,
  seasonTranslation,
  episodeTranslation,
  mediaFile,
} from "@canto/db/schema";
import {
  getSupportedLanguageCodes,
  persistSeasons,
  persistTranslations,
  buildTmdbStillMap,
  overlayTmdbStills,
} from "@canto/db/persist-media";
import {
  findMediaById,
  updateMedia,
} from "../../infrastructure/repositories/media-repository";
import type { MediaProviderPort } from "../ports/media-provider.port";
import { logAndSwallow } from "../../lib/log-error";
import type { JobDispatcherPort } from "../ports/job-dispatcher.port";
import { getEffectiveProvider } from "../rules/effective-provider";

/**
 * Reconcile season/episode structure from TVDB without touching TMDB metadata.
 * Saves structure in English (fast), then dispatches per-language translation jobs.
 */
export async function reconcileShowStructure(
  db: Database,
  mediaId: string,
  deps: { tmdb: MediaProviderPort; tvdb: MediaProviderPort; dispatcher: JobDispatcherPort },
  options?: { force?: boolean },
): Promise<void> {
  const row = await findMediaById(db, mediaId);
  if (!row || row.type !== "show") return;

  if (!options?.force) {
    const effectiveProvider = await getEffectiveProvider(row);
    if (effectiveProvider !== "tvdb") return;
  }

  const isAlreadyTvdb = row.provider === "tvdb";
  const tvdb = deps.tvdb;

  // Resolve TVDB ID
  let tvdbId = isAlreadyTvdb ? row.externalId : row.tvdbId;
  if (!tvdbId) {
    try {
      const results = await tvdb.search(row.title, "show");
      if (results.results.length > 0) tvdbId = results.results[0]!.externalId;
    } catch { /* not found */ }
    if (!tvdbId) return;
    if (!isAlreadyTvdb) await updateMedia(db, mediaId, { tvdbId });
  }

  // Fetch TVDB structure in English only (fast, no per-language episode fetching)
  const tvdbData = await tvdb.getMetadata(tvdbId, "show");

  if (!tvdbData.seasons || tvdbData.seasons.length === 0) {
    console.log(`[reconcile] "${row.title}": TVDB has no seasons, skipping`);
    return;
  }

  // Apply TVDB season/episode structure (TMDB shows only — TVDB-native already has it)
  if (!isAlreadyTvdb) {
    // Save existing episode translations before deleting seasons (cascade deletes them)
    const existingSeasons = await db.query.season.findMany({
      where: eq(season.mediaId, mediaId),
      with: {
        episodes: {
          columns: { id: true, number: true, absoluteNumber: true },
        },
      },
    });

    const existingEpIds = existingSeasons.flatMap((s) =>
      s.episodes.map((e) => e.id),
    );

    interface SavedEpTranslation {
      absoluteNumber: number | null;
      seasonNumber: number;
      episodeNumber: number;
      language: string;
      title: string | null;
      overview: string | null;
    }
    let savedEpTranslations: SavedEpTranslation[] = [];

    if (existingEpIds.length > 0) {
      const epTrans = await db.query.episodeTranslation.findMany({
        where: sql`${episodeTranslation.episodeId} IN (${sql.join(
          existingEpIds.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      });

      // Build lookup: episodeId -> {absoluteNumber, seasonNumber, episodeNumber}
      const epInfoById = new Map<
        string,
        { absoluteNumber: number | null; seasonNumber: number; number: number }
      >();
      for (const s of existingSeasons) {
        for (const e of s.episodes) {
          epInfoById.set(e.id, {
            absoluteNumber: e.absoluteNumber,
            seasonNumber: s.number,
            number: e.number,
          });
        }
      }

      savedEpTranslations = epTrans.map((t) => {
        const info = epInfoById.get(t.episodeId);
        return {
          absoluteNumber: info?.absoluteNumber ?? null,
          seasonNumber: info?.seasonNumber ?? 0,
          episodeNumber: info?.number ?? 0,
          language: t.language,
          title: t.title,
          overview: t.overview,
        };
      });
    }

    // Save season translations
    const existingSeasonIds = existingSeasons.map((s) => s.id);
    interface SavedSeasonTranslation {
      seasonNumber: number;
      language: string;
      name: string | null;
      overview: string | null;
    }
    let savedSeasonTranslations: SavedSeasonTranslation[] = [];

    if (existingSeasonIds.length > 0) {
      const sTrans = await db.query.seasonTranslation.findMany({
        where: sql`${seasonTranslation.seasonId} IN (${sql.join(
          existingSeasonIds.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      });

      const seasonNumberById = new Map(
        existingSeasons.map((s) => [s.id, s.number]),
      );

      savedSeasonTranslations = sTrans.map((t) => ({
        seasonNumber: seasonNumberById.get(t.seasonId) ?? 0,
        language: t.language,
        name: t.name,
        overview: t.overview,
      }));
    }

    // Save existing media_files before deleting seasons (cascade deletes episodes + media_files)
    interface SavedMediaFile {
      filePath: string;
      mediaId: string;
      torrentId: string | null;
      quality: string | null;
      source: string | null;
      status: string;
      sizeBytes: number | null;
      absoluteNumber: number | null;
      seasonNumber: number;
      episodeNumber: number;
    }
    let savedMediaFiles: SavedMediaFile[] = [];

    if (existingEpIds.length > 0) {
      const files = await db.query.mediaFile.findMany({
        where: eq(mediaFile.mediaId, mediaId),
      });

      // Build lookup: episodeId -> {absoluteNumber, seasonNumber, episodeNumber}
      const epInfoById = new Map<
        string,
        { absoluteNumber: number | null; seasonNumber: number; number: number }
      >();
      for (const s of existingSeasons) {
        for (const e of s.episodes) {
          epInfoById.set(e.id, {
            absoluteNumber: e.absoluteNumber,
            seasonNumber: s.number,
            number: e.number,
          });
        }
      }

      savedMediaFiles = files
        .filter((f) => f.episodeId != null)
        .map((f) => {
          const info = epInfoById.get(f.episodeId!);
          return {
            filePath: f.filePath,
            mediaId: f.mediaId,
            torrentId: f.torrentId,
            quality: f.quality,
            source: f.source,
            status: f.status,
            sizeBytes: f.sizeBytes,
            absoluteNumber: info?.absoluteNumber ?? null,
            seasonNumber: info?.seasonNumber ?? 0,
            episodeNumber: info?.number ?? 0,
          };
        });
    }

    // NOW delete seasons (cascade deletes episodes + translations + media_files)
    await db.delete(season).where(eq(season.mediaId, mediaId));
    await persistSeasons(db, mediaId, tvdbData);
    await updateMedia(db, mediaId, {
      numberOfSeasons: tvdbData.numberOfSeasons,
      numberOfEpisodes: tvdbData.numberOfEpisodes,
    });

    // Restore saved translations and media_files by matching to new episodes
    if (savedEpTranslations.length > 0 || savedSeasonTranslations.length > 0 || savedMediaFiles.length > 0) {
      const newSeasons = await db.query.season.findMany({
        where: eq(season.mediaId, mediaId),
        with: {
          episodes: {
            columns: { id: true, number: true, absoluteNumber: true },
          },
        },
      });

      // Restore season translations
      if (savedSeasonTranslations.length > 0) {
        const seasonIdByNumber = new Map(
          newSeasons.map((s) => [s.number, s.id]),
        );
        const seasonTransRows = savedSeasonTranslations
          .filter((t) => seasonIdByNumber.has(t.seasonNumber))
          .map((t) => ({
            seasonId: seasonIdByNumber.get(t.seasonNumber)!,
            language: t.language,
            name: t.name,
            overview: t.overview,
          }));

        for (let i = 0; i < seasonTransRows.length; i += 500) {
          const chunk = seasonTransRows.slice(i, i + 500);
          await db
            .insert(seasonTranslation)
            .values(chunk)
            .onConflictDoUpdate({
              target: [seasonTranslation.seasonId, seasonTranslation.language],
              set: {
                name: sql`EXCLUDED.name`,
                overview: sql`EXCLUDED.overview`,
              },
            });
        }
      }

      // Restore episode translations
      if (savedEpTranslations.length > 0) {
        // Build lookup from new episodes: absoluteNumber -> id, (seasonNumber, episodeNumber) -> id
        const newEpByAbsolute = new Map<number, string>();
        const newEpBySeasonEp = new Map<string, string>();
        for (const s of newSeasons) {
          for (const e of s.episodes) {
            if (e.absoluteNumber != null) {
              newEpByAbsolute.set(e.absoluteNumber, e.id);
            }
            newEpBySeasonEp.set(`${s.number}-${e.number}`, e.id);
          }
        }

        const epTransRows: Array<{
          episodeId: string;
          language: string;
          title: string | null;
          overview: string | null;
        }> = [];

        for (const t of savedEpTranslations) {
          // Prefer absoluteNumber match, fall back to seasonNumber+episodeNumber
          let newEpId: string | undefined;
          if (t.absoluteNumber != null) {
            newEpId = newEpByAbsolute.get(t.absoluteNumber);
          }
          if (!newEpId) {
            newEpId = newEpBySeasonEp.get(
              `${t.seasonNumber}-${t.episodeNumber}`,
            );
          }
          if (newEpId) {
            epTransRows.push({
              episodeId: newEpId,
              language: t.language,
              title: t.title,
              overview: t.overview,
            });
          }
        }

        for (let i = 0; i < epTransRows.length; i += 500) {
          const chunk = epTransRows.slice(i, i + 500);
          await db
            .insert(episodeTranslation)
            .values(chunk)
            .onConflictDoUpdate({
              target: [
                episodeTranslation.episodeId,
                episodeTranslation.language,
              ],
              set: {
                title: sql`EXCLUDED.title`,
                overview: sql`EXCLUDED.overview`,
              },
            });
        }
      }

      // Restore media_files by matching to new episodes
      if (savedMediaFiles.length > 0) {
        const newEpByAbsolute = new Map<number, string>();
        const newEpBySeasonEp = new Map<string, string>();
        for (const s of newSeasons) {
          for (const e of s.episodes) {
            if (e.absoluteNumber != null) {
              newEpByAbsolute.set(e.absoluteNumber, e.id);
            }
            newEpBySeasonEp.set(`${s.number}-${e.number}`, e.id);
          }
        }

        const fileRows: Array<{
          mediaId: string;
          episodeId: string | null;
          torrentId: string | null;
          filePath: string;
          quality: string | null;
          source: string | null;
          status: string;
          sizeBytes: number | null;
        }> = [];

        for (const f of savedMediaFiles) {
          let newEpId: string | undefined;
          if (f.absoluteNumber != null) {
            newEpId = newEpByAbsolute.get(f.absoluteNumber);
          }
          if (!newEpId) {
            newEpId = newEpBySeasonEp.get(
              `${f.seasonNumber}-${f.episodeNumber}`,
            );
          }
          if (!newEpId) {
            console.warn(
              `[reconcile] media_file "${f.filePath}" could not be matched to a new episode (abs=${f.absoluteNumber}, S${f.seasonNumber}E${f.episodeNumber})`,
            );
          }
          fileRows.push({
            mediaId: f.mediaId,
            episodeId: newEpId ?? null,
            torrentId: f.torrentId,
            filePath: f.filePath,
            quality: f.quality,
            source: f.source,
            status: f.status,
            sizeBytes: f.sizeBytes,
          });
        }

        for (let i = 0; i < fileRows.length; i += 500) {
          const chunk = fileRows.slice(i, i + 500);
          await db.insert(mediaFile).values(chunk);
        }
      }
    }
  }

  const supportedLangs = [...(await getSupportedLanguageCodes(db))];

  // Fetch TMDB metadata for episode still images + translations
  // TMDB-native: use row.externalId directly; TVDB-native: resolve via IMDB cross-ref
  let tmdbExternalId: number | undefined;
  if (!isAlreadyTvdb) {
    tmdbExternalId = row.externalId;
  } else if (row.imdbId && deps.tmdb.findByImdbId) {
    try {
      const found = await deps.tmdb.findByImdbId(row.imdbId);
      const match = found.find((r: { type: string }) => r.type === "show");
      if (match) tmdbExternalId = match.externalId;
    } catch { /* IMDB cross-ref failed */ }
  }

  if (tmdbExternalId) {
    try {
      const tmdbData = await deps.tmdb.getMetadata(tmdbExternalId, "show", { supportedLanguages: supportedLangs });

      // Overlay TMDB still images onto TVDB episodes via absoluteNumber mapping
      if (tmdbData.seasons) {
        const tmdbStillMap = buildTmdbStillMap(tmdbData.seasons);
        await overlayTmdbStills(db, mediaId, tmdbStillMap);
      }

      // Update base images from TMDB (TVDB images may be in wrong language)
      await updateMedia(db, mediaId, {
        ...(tmdbData.posterPath ? { posterPath: tmdbData.posterPath } : {}),
        ...(tmdbData.backdropPath ? { backdropPath: tmdbData.backdropPath } : {}),
        ...(tmdbData.logoPath ? { logoPath: tmdbData.logoPath } : {}),
      });

      // Persist TMDB media-level translations (title, overview, posters, logos) without touching seasons
      if (tmdbData.translations) {
        await persistTranslations(db, mediaId, {
          ...tmdbData,
          seasonTranslations: undefined,
          episodeTranslations: undefined,
        } as typeof tmdbData);
      }
    } catch (err) {
      console.warn(`[reconcile] TMDB backfill failed for "${row.title}":`, err instanceof Error ? err.message : err);
    }
  }

  // Dispatch per-language episode translation jobs in background
  const nonEnLangs = supportedLangs.filter((l) => !l.startsWith("en"));
  for (const lang of nonEnLangs) {
    void deps.dispatcher.translateEpisodes(mediaId, tvdbId, lang).catch(logAndSwallow("reconcile dispatchTranslateEpisodes"));
  }

  const tvdbSeasonCount = tvdbData.seasons.filter((s) => s.number > 0).length;
  console.log(
    `[reconcile] "${row.title}": TVDB structure applied (${tvdbSeasonCount} seasons, ${tvdbData.numberOfEpisodes ?? 0} eps), ${nonEnLangs.length} translation jobs dispatched`,
  );
}
