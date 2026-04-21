/* -------------------------------------------------------------------------- */
/*  Use-case: manual "Fix match" flow                                         */
/*                                                                            */
/*  With the media_version model a mismatch is just a bad media_id pointer.  */
/*  Re-pointing is a single UPDATE per version — no side-moving, no claim    */
/*  dance. Scope can be a single version or all versions that currently       */
/*  share a media_id (for the "fix parent" bulk action).                     */
/* -------------------------------------------------------------------------- */

import type { Database } from "@canto/db/client";
import type { MediaProviderPort } from "../../ports/media-provider.port";
import { persistMedia } from "./persist";
import { getActiveUserLanguages } from "../../services/user-service";
import {
  findMediaVersionById,
  findMediaVersionsByMediaId,
  updateMediaVersion,
  findMediaByAnyReference,
  findMediaById,
  updateMedia,
  deleteMedia,
  isMediaOrphaned,
} from "../../../infrastructure/repositories/media";

export type ResolveMediaVersionInput =
  | { versionId: string; tmdbId: number; type: "movie" | "show" }
  | { mediaId: string; tmdbId: number; type: "movie" | "show" };

export interface ResolutionPreview {
  versionsAffected: number;
  targetMediaId: string;
  targetTitle: string;
  targetYear: number | null;
  orphanedMedia: Array<{ id: string; title: string; year: number | null }>;
}

export interface ResolutionResult {
  mediaId: string;
  suggestedName: string;
  versionsAffected: number;
  orphanedMediaDeleted: number;
}

/**
 * Dry-run helper: report what `resolveMediaVersion` would do without
 * touching the database. Used by the UI to show the user a confirmation
 * preview before committing.
 */
export async function resolveMediaVersionPreview(
  db: Database,
  input: ResolveMediaVersionInput,
  tmdb: MediaProviderPort,
): Promise<ResolutionPreview> {
  return (await resolveMediaVersion(db, input, tmdb, { dryRun: true })) as ResolutionPreview;
}

/**
 * Re-point one version (or every version that shares a parent media) at a
 * new TMDB id. Creates the target media row on demand, updates the
 * version(s), and GCs the previously-referenced media if it becomes
 * orphaned.
 *
 * In `dryRun` mode no mutations are performed — returns a ResolutionPreview.
 */
export async function resolveMediaVersion(
  db: Database,
  input: ResolveMediaVersionInput,
  tmdb: MediaProviderPort,
  opts: { dryRun?: boolean } = {},
): Promise<ResolutionResult | ResolutionPreview> {
  const dryRun = opts.dryRun === true;

  const versions = await loadTargetVersions(db, input);
  if (versions.length === 0) throw new Error("No versions to resolve");

  const oldMediaIds = new Set<string>();
  for (const v of versions) if (v.mediaId) oldMediaIds.add(v.mediaId);

  const existingTarget = await findMediaByAnyReference(db, input.tmdbId, "tmdb");

  let targetMediaId: string;
  let targetTitle: string;
  let targetYear: number | null;

  if (existingTarget) {
    targetMediaId = existingTarget.id;
    targetTitle = existingTarget.title;
    targetYear = existingTarget.year ?? null;
  } else {
    // Pull metadata upfront so dryRun can surface an accurate preview.
    const supportedLangs = [...(await getActiveUserLanguages(db))];
    const normalized = await tmdb.getMetadata(input.tmdbId, input.type, {
      supportedLanguages: supportedLangs,
    });
    targetTitle = normalized.title;
    targetYear = normalized.year ?? null;

    if (dryRun) {
      targetMediaId = "(new)";
    } else {
      const inserted = await persistMedia(db, normalized);
      const firstPath = versions.find((v) => v.serverItemPath)?.serverItemPath ?? null;
      const mediaUpdates: Record<string, unknown> = {
        inLibrary: true,
        downloaded: true,
        addedAt: new Date(),
      };
      if (firstPath) mediaUpdates.libraryPath = firstPath;
      await updateMedia(db, inserted.id, mediaUpdates);
      targetMediaId = inserted.id;
    }
  }

  // Compute which old media rows would become orphaned. For dryRun we use
  // the current DB state with each affected version "excluded". For bulk
  // mediaId input the answer is trivially "all of them" since every
  // version is being moved.
  const versionIds = new Set(versions.map((v) => v.id));
  const orphanedMedia: Array<{ id: string; title: string; year: number | null }> = [];

  for (const oldId of oldMediaIds) {
    if (oldId === targetMediaId) continue;

    // Count versions that would still point to oldId after the move:
    // fetch current versions, subtract the ones we're repointing.
    const current = await findMediaVersionsByMediaId(db, oldId);
    const remaining = current.filter((v) => !versionIds.has(v.id));
    if (remaining.length > 0) continue;

    // Still need to check torrents via isMediaOrphaned — pass a sentinel
    // exclude so the version-count side of the check matches our logic.
    // Since `remaining` is already 0 we just need the torrent check:
    const orphaned = await isMediaOrphaned(db, oldId, versions[0]?.id);
    if (!orphaned) continue;

    const row = await findMediaById(db, oldId);
    if (row) orphanedMedia.push({ id: row.id, title: row.title, year: row.year ?? null });
  }

  if (dryRun) {
    return {
      versionsAffected: versions.length,
      targetMediaId,
      targetTitle,
      targetYear,
      orphanedMedia,
    };
  }

  // Commit phase: update each version row.
  for (const v of versions) {
    await updateMediaVersion(db, v.id, {
      mediaId: targetMediaId,
      tmdbId: input.tmdbId,
      result: "imported",
      reason: null,
    });
  }

  // GC old media rows that are now orphaned.
  let orphanedDeleted = 0;
  for (const oldId of oldMediaIds) {
    if (oldId === targetMediaId) continue;
    const stillOrphaned = await isMediaOrphaned(db, oldId);
    if (stillOrphaned) {
      await deleteMedia(db, oldId);
      orphanedDeleted++;
      console.log(`[resolve-media-version] Deleted orphaned media ${oldId}`);
    }
  }

  return {
    mediaId: targetMediaId,
    suggestedName: `${targetTitle} (${targetYear ?? "Unknown"}) [tmdb-${input.tmdbId}]`,
    versionsAffected: versions.length,
    orphanedMediaDeleted: orphanedDeleted,
  };
}

async function loadTargetVersions(db: Database, input: ResolveMediaVersionInput) {
  if ("versionId" in input) {
    const row = await findMediaVersionById(db, input.versionId);
    if (!row) throw new Error("Media version not found");
    return [row];
  }
  return findMediaVersionsByMediaId(db, input.mediaId);
}
