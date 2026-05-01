/* -------------------------------------------------------------------------- */
/*  Use-case: Auto-supersede a downloaded release with a stricter upgrade    */
/* -------------------------------------------------------------------------- */

import type { Database } from "@canto/db/client";

import type { MediaRepositoryPort } from "@canto/core/domain/media/ports/media-repository.port";
import type { DownloadClientPort } from "@canto/core/domain/shared/ports/download-client";
import type { LoggerPort } from "@canto/core/domain/shared/ports/logger.port";
import { resolveMediaFlavor } from "@canto/core/domain/shared/rules/media-flavor";
import { compareToProfile } from "@canto/core/domain/torrents/rules/download-profile";
import { detectReleaseGroup } from "@canto/core/domain/torrents/rules/parsing-release";
import type { TorrentsRepositoryPort } from "@canto/core/domain/torrents/ports/torrents-repository.port";
import type { SearchResult } from "@canto/core/domain/torrents/use-cases/search-torrents";
import { replaceTorrent } from "@canto/core/domain/torrents/use-cases/download-torrent";

/**
 * Outcome of an auto-supersede attempt. The job logger uses the `reason`
 * to surface why a replacement was skipped without flooding the logs
 * with success cases.
 */
export type AutoSupersedeOutcome =
  | { replaced: true; reason?: never }
  | {
      replaced: false;
      reason:
        | "no-current-download"
        | "no-current-files"
        | "different-release-group"
        | "lower-or-equal-repack"
        | "different-quality-or-source"
        | "profile-rejected"
        | "media-not-found";
    };

export interface AutoSupersedeArgs {
  currentDownloadId: string;
  candidate: SearchResult;
}

export interface AutoSupersedeDeps {
  logger: LoggerPort;
  media: MediaRepositoryPort;
  torrents: TorrentsRepositoryPort;
}

/**
 * Replace a downloaded release with a strictly-better repack candidate.
 *
 * Conditions for a replacement to fire:
 *   1. Current download exists and has at least one media_file linked.
 *   2. Same release group (case-insensitive) as the current download.
 *   3. Same quality and source — repack supersede only swaps within a
 *      profile slot.
 *   4. Strictly higher repackCount (REPACK > original; REPACK2 > REPACK1).
 *   5. If a download profile is active, the candidate combo must not be
 *      `"candidate-not-allowed"` and must not be a `"downgrade"`.
 */
export async function autoSupersedeWithRepack(
  db: Database,
  deps: AutoSupersedeDeps,
  args: AutoSupersedeArgs,
  qbClient: DownloadClientPort,
): Promise<AutoSupersedeOutcome> {
  const current = await deps.torrents.findDownloadById(args.currentDownloadId);
  if (!current) return { replaced: false, reason: "no-current-download" };

  const candidate = args.candidate;

  if (
    current.quality !== candidate.quality ||
    current.source !== candidate.source
  ) {
    return { replaced: false, reason: "different-quality-or-source" };
  }

  if (candidate.repackCount <= current.repackCount) {
    return { replaced: false, reason: "lower-or-equal-repack" };
  }

  const currentGroup =
    current.releaseGroup ?? detectReleaseGroup(current.title);
  const candidateGroup = candidate.releaseGroup;
  if (
    !currentGroup ||
    !candidateGroup ||
    currentGroup.toLowerCase() !== candidateGroup.toLowerCase()
  ) {
    return { replaced: false, reason: "different-release-group" };
  }

  if (!current.mediaId) {
    return { replaced: false, reason: "media-not-found" };
  }
  const mediaRow = await deps.media.findById(current.mediaId);
  if (!mediaRow) return { replaced: false, reason: "media-not-found" };

  const flavor = resolveMediaFlavor({
    type: mediaRow.type as "movie" | "show",
    originCountry: mediaRow.originCountry,
    originalLanguage: mediaRow.originalLanguage,
    genres: mediaRow.genres,
    genreIds: mediaRow.genreIds,
  });
  const profile = await deps.torrents.findActiveDownloadProfile({
    mediaDownloadProfileId: mediaRow.downloadProfileId ?? null,
    folderDownloadProfileId: null,
    flavor,
  });
  if (profile) {
    const verdict = compareToProfile(
      { quality: current.quality, source: current.source },
      { quality: candidate.quality, source: candidate.source },
      profile,
    );
    if (verdict === "candidate-not-allowed" || verdict === "downgrade") {
      return { replaced: false, reason: "profile-rejected" };
    }
  }

  const linkedFiles = await deps.torrents.findMediaFilesByDownloadId(current.id);
  if (linkedFiles.length === 0) {
    return { replaced: false, reason: "no-current-files" };
  }

  await replaceTorrent(
    db,
    { logger: deps.logger, torrents: deps.torrents, media: deps.media },
    {
      mediaId: current.mediaId,
      title: candidate.title,
      magnetUrl: candidate.magnetUrl ?? undefined,
      torrentUrl: candidate.downloadUrl ?? undefined,
      seasonNumber: current.seasonNumber ?? undefined,
      episodeNumbers: current.episodeNumbers ?? undefined,
      replaceFileIds: linkedFiles.map((f) => f.id),
    },
    qbClient,
  );

  return { replaced: true };
}
