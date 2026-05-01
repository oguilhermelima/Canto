/* -------------------------------------------------------------------------- */
/*  Use-case: manual "Fix match" flow                                         */
/*                                                                            */
/*  With the media_version model a mismatch is just a bad media_id pointer.  */
/*  Re-pointing is a single UPDATE per version — no side-moving, no claim    */
/*  dance. Scope can be a single version or all versions that currently       */
/*  share a media_id (for the "fix parent" bulk action).                     */
/* -------------------------------------------------------------------------- */

import type { Database } from "@canto/db/client";
import type { MediaRepositoryPort } from "@canto/core/domain/media/ports/media-repository.port";
import type { MediaLocalizationRepositoryPort } from "@canto/core/domain/media/ports/media-localization-repository.port";
import type { MediaVersionRepositoryPort } from "@canto/core/domain/media-servers/ports/media-version-repository.port";
import type { MediaProviderPort } from "@canto/core/domain/shared/ports/media-provider.port";
import type { MediaVersionRow } from "@canto/core/domain/media-servers/types/media-version";
import { persistMedia } from "@canto/core/domain/media/use-cases/persist";
import type { PersistDeps } from "@canto/core/domain/media/use-cases/persist/core";
import { getActiveUserLanguages } from "@canto/core/domain/shared/services/user-service";
import {
  EmptyVersionListError,
  MediaVersionNotFoundError,
} from "@canto/core/domain/media/errors";

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

export interface ResolveMediaVersionDeps extends PersistDeps {
  media: MediaRepositoryPort;
  localization: MediaLocalizationRepositoryPort;
  mediaVersion: MediaVersionRepositoryPort;
}

/**
 * Dry-run helper: report what `resolveMediaVersion` would do without
 * touching the database. Used by the UI to show the user a confirmation
 * preview before committing.
 */
export async function resolveMediaVersionPreview(
  db: Database,
  deps: ResolveMediaVersionDeps,
  input: ResolveMediaVersionInput,
  tmdb: MediaProviderPort,
): Promise<ResolutionPreview> {
  return (await resolveMediaVersion(db, deps, input, tmdb, {
    dryRun: true,
  })) as ResolutionPreview;
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
  deps: ResolveMediaVersionDeps,
  input: ResolveMediaVersionInput,
  tmdb: MediaProviderPort,
  opts: { dryRun?: boolean } = {},
): Promise<ResolutionResult | ResolutionPreview> {
  const dryRun = opts.dryRun === true;

  const versions = await loadTargetVersions(deps.mediaVersion, input);
  if (versions.length === 0) throw new EmptyVersionListError();

  const oldMediaIds = new Set<string>();
  for (const v of versions) if (v.mediaId) oldMediaIds.add(v.mediaId);

  const existingTarget = await deps.media.findByAnyReference(input.tmdbId, "tmdb");

  let targetMediaId: string;
  let targetTitle: string;
  let targetYear: number | null;

  if (existingTarget) {
    targetMediaId = existingTarget.id;
    const targetLoc = await deps.localization.findLocalizedById(
      existingTarget.id,
      "en-US",
    );
    targetTitle = targetLoc?.title ?? "";
    targetYear = existingTarget.year ?? null;
  } else {
    const supportedLangs = [...(await getActiveUserLanguages(db))];
    const normalized = await tmdb.getMetadata(input.tmdbId, input.type, {
      supportedLanguages: supportedLangs,
    });
    targetTitle = normalized.title;
    targetYear = normalized.year ?? null;

    if (dryRun) {
      targetMediaId = "(new)";
    } else {
      const inserted = await persistMedia(db, normalized, deps);
      const firstPath =
        versions.find((v) => v.serverItemPath)?.serverItemPath ?? null;
      const mediaUpdates: Record<string, unknown> = {
        inLibrary: true,
        downloaded: true,
        addedAt: new Date(),
      };
      if (firstPath) mediaUpdates.libraryPath = firstPath;
      await deps.media.updateMedia(inserted.id, mediaUpdates);
      targetMediaId = inserted.id;
    }
  }

  // Compute which old media rows would become orphaned. For dryRun we use
  // the current DB state with each affected version "excluded". For bulk
  // mediaId input the answer is trivially "all of them" since every
  // version is being moved.
  const versionIds = new Set(versions.map((v) => v.id));
  const orphanedMedia: Array<{
    id: string;
    title: string;
    year: number | null;
  }> = [];

  for (const oldId of oldMediaIds) {
    if (oldId === targetMediaId) continue;

    const current = await deps.mediaVersion.findByMediaId(oldId);
    const remaining = current.filter((v) => !versionIds.has(v.id));
    if (remaining.length > 0) continue;

    const orphaned = await deps.media.isMediaOrphaned(oldId, versions[0]?.id);
    if (!orphaned) continue;

    const row = await deps.media.findById(oldId);
    if (row) {
      const orphanLoc = await deps.localization.findLocalizedById(
        row.id,
        "en-US",
      );
      orphanedMedia.push({
        id: row.id,
        title: orphanLoc?.title ?? "",
        year: row.year ?? null,
      });
    }
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

  for (const v of versions) {
    await deps.mediaVersion.update(v.id, {
      mediaId: targetMediaId,
      tmdbId: input.tmdbId,
      result: "imported",
      reason: null,
    });
  }

  let orphanedDeleted = 0;
  for (const oldId of oldMediaIds) {
    if (oldId === targetMediaId) continue;
    const stillOrphaned = await deps.media.isMediaOrphaned(oldId);
    if (stillOrphaned) {
      await deps.media.deleteMedia(oldId);
      orphanedDeleted++;
      deps.logger.info?.(
        `[resolve-media-version] Deleted orphaned media ${oldId}`,
      );
    }
  }

  return {
    mediaId: targetMediaId,
    suggestedName: `${targetTitle} (${targetYear ?? "Unknown"}) [tmdb-${input.tmdbId}]`,
    versionsAffected: versions.length,
    orphanedMediaDeleted: orphanedDeleted,
  };
}

async function loadTargetVersions(
  mediaVersion: MediaVersionRepositoryPort,
  input: ResolveMediaVersionInput,
): Promise<MediaVersionRow[]> {
  if ("versionId" in input) {
    const row = await mediaVersion.findById(input.versionId);
    if (!row) throw new MediaVersionNotFoundError();
    return [row];
  }
  return mediaVersion.findByMediaId(input.mediaId);
}
