/* -------------------------------------------------------------------------- */
/*  Use-case: Auto-supersede a downloaded release with a stricter upgrade    */
/* -------------------------------------------------------------------------- */

import type { Database } from "@canto/db/client";

import type { DownloadClientPort } from "../../shared/ports/download-client";
import { compareToProfile } from "../rules/download-profile";
import { detectReleaseGroup } from "../rules/parsing-release";
import { resolveMediaFlavor } from "../../shared/rules/media-flavor";
import {
  findDownloadById,
  findMediaById,
  findMediaFilesByDownloadId,
} from "../../../infra/repositories";
import { findActiveDownloadProfile } from "../../../infra/torrents/download-profile-repository";
import type { Quality, Source } from "../types/common";
import type { SearchResult } from "./search-torrents";
import { replaceTorrent } from "./download-torrent";

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
  /** Existing download row that the candidate is meant to replace. */
  currentDownloadId: string;
  /** Search-result candidate (parsed attributes already populated). */
  candidate: SearchResult;
}

/**
 * Replace a downloaded release with a strictly-better repack candidate.
 *
 * Conditions for a replacement to fire:
 *   1. Current download exists and has at least one media_file linked.
 *   2. Same release group (case-insensitive) as the current download —
 *      different groups would change the encode, not just refresh it.
 *   3. Same quality and source — repack supersede only swaps within a
 *      profile slot.
 *   4. Strictly higher repackCount (REPACK > original; REPACK2 > REPACK1).
 *   5. If a download profile is active, the candidate combo must not be
 *      `"candidate-not-allowed"` and must not be a `"downgrade"` — i.e.
 *      it's still in the profile and at least equivalent.
 *
 * Pure for everything except the final {@link replaceTorrent} call. The
 * caller (the BullMQ job) decides which `(currentDownloadId, candidate)`
 * pairs to attempt; this function is the strict gate.
 */
export async function autoSupersedeWithRepack(
  db: Database,
  args: AutoSupersedeArgs,
  qbClient: DownloadClientPort,
): Promise<AutoSupersedeOutcome> {
  const current = await findDownloadById(db, args.currentDownloadId);
  if (!current) return { replaced: false, reason: "no-current-download" };

  const candidate = args.candidate;

  // (3) Same quality + source slot — supersede is intra-profile-slot.
  if (current.quality !== candidate.quality || current.source !== candidate.source) {
    return { replaced: false, reason: "different-quality-or-source" };
  }

  // (4) Strict repack upgrade.
  if (candidate.repackCount <= current.repackCount) {
    return { replaced: false, reason: "lower-or-equal-repack" };
  }

  // (2) Same release group, lookup case-insensitive. Prefer the
  // snapshotted column written at insert time; fall back to parsing the
  // title for legacy rows that pre-date the column.
  const currentGroup = current.releaseGroup ?? detectReleaseGroup(current.title);
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
  const mediaRow = await findMediaById(db, current.mediaId);
  if (!mediaRow) return { replaced: false, reason: "media-not-found" };

  // (5) Profile gate. Skip when no profile is set — the supersede then
  // relies on (2)/(3)/(4) alone.
  const flavor = resolveMediaFlavor({
    type: mediaRow.type as "movie" | "show",
    originCountry: mediaRow.originCountry,
    originalLanguage: mediaRow.originalLanguage,
    genres: mediaRow.genres,
    genreIds: mediaRow.genreIds,
  });
  const profile = await findActiveDownloadProfile(db, {
    mediaDownloadProfileId: mediaRow.downloadProfileId ?? null,
    folderDownloadProfileId: null,
    flavor,
  });
  if (profile) {
    const verdict = compareToProfile(
      { quality: current.quality as Quality, source: current.source as Source },
      { quality: candidate.quality, source: candidate.source },
      profile,
    );
    // Equivalent is the expected verdict for a same-slot repack — that's
    // fine; only block hard rejects.
    if (verdict === "candidate-not-allowed" || verdict === "downgrade") {
      return { replaced: false, reason: "profile-rejected" };
    }
  }

  // (1) Pull the linked media_file IDs so the replace flow knows what
  // to swap. A download with no files linked is bookkeeping-only and
  // shouldn't be auto-superseded — the manual flow is the safer path.
  const linkedFiles = await findMediaFilesByDownloadId(db, current.id);
  if (linkedFiles.length === 0) {
    return { replaced: false, reason: "no-current-files" };
  }

  await replaceTorrent(
    db,
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
