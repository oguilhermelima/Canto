import { db } from "@canto/db/client";
import { getDownloadClient } from "@canto/api/infrastructure/adapters/download-client-factory";
import { buildIndexers } from "@canto/api/infrastructure/adapters/indexer-factory";
import { searchTorrents } from "@canto/api/domain/use-cases/search-torrents";
import { downloadTorrent } from "@canto/api/domain/use-cases/download-torrent";
import { createNotification } from "@canto/api/domain/use-cases/create-notification";
import {
  findAllTorrents,
  updateTorrent,
  createBlocklistEntry,
} from "@canto/api/infrastructure/repositories";

/** How long a torrent must be downloading with no progress before we consider it stalled (ms) */
const STALL_THRESHOLD_MS = 60 * 60 * 1000; // 60 minutes

/**
 * Detect stalled downloads and optionally auto-retry with next-best result.
 *
 * A torrent is considered stalled if:
 * 1. DB status is "downloading"
 * 2. qBittorrent reports state "stalledDL"
 * 3. It was created more than STALL_THRESHOLD_MS ago
 */
export async function handleStallDetection(): Promise<void> {
  const qb = await getDownloadClient();

  let liveTorrents: Array<{ hash: string; state: string; progress: number }>;
  try {
    liveTorrents = await qb.listTorrents();
  } catch {
    console.warn("[stall-detection] qBittorrent unreachable, skipping");
    return;
  }

  const liveMap = new Map(liveTorrents.map((t) => [t.hash, t]));
  const allTorrents = await findAllTorrents(db);

  const now = Date.now();
  const stalled: typeof allTorrents = [];

  for (const row of allTorrents) {
    if (row.status !== "downloading" || !row.hash) continue;

    const live = liveMap.get(row.hash);
    if (!live) continue;

    // Only flag if qBit reports stalledDL
    if (live.state !== "stalledDL") continue;

    // Check age — don't stall-flag very recent torrents
    const createdAt = row.createdAt ? new Date(row.createdAt).getTime() : 0;
    if (now - createdAt < STALL_THRESHOLD_MS) continue;

    stalled.push(row);
  }

  if (stalled.length === 0) return;

  console.log(
    `[stall-detection] Found ${stalled.length} stalled torrent(s)`,
  );

  for (const row of stalled) {
    try {
      // Mark as stalled
      await updateTorrent(db, row.id, { status: "stalled" });

      // Create notification
      await createNotification(db, {
        title: "Download stalled",
        message: `"${row.title}" has been stalled for over an hour.`,
        type: "download_stalled",
        mediaId: row.mediaId ?? undefined,
      });

      // Auto-retry: search for alternative and download
      if (row.mediaId) {
        await autoRetryStalled(row);
      }
    } catch (err) {
      console.error(
        `[stall-detection] Error handling "${row.title}":`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}

async function autoRetryStalled(
  row: { id: string; title: string; mediaId: string | null; seasonNumber: number | null; episodeNumbers: number[] | null },
): Promise<void> {
  if (!row.mediaId) return;

  // Blocklist the stalled torrent
  try {
    await createBlocklistEntry(db, {
      mediaId: row.mediaId,
      title: row.title,
      reason: "stalled",
    });
  } catch {
    // May already be blocklisted
  }

  // Remove stalled torrent from qBit
  const qb = await getDownloadClient();
  try {
    const stalledRow = await db.query.torrent.findFirst({
      where: (t, { eq }) => eq(t.id, row.id),
    });
    if (stalledRow?.hash) {
      await qb.deleteTorrent(stalledRow.hash, false);
    }
  } catch {
    // qBit may not have it
  }

  // Search for alternative
  const indexers = await buildIndexers();
  if (indexers.length === 0) return;

  try {
    const { results } = await searchTorrents(
      db,
      {
        mediaId: row.mediaId,
        seasonNumber: row.seasonNumber ?? undefined,
        episodeNumbers: row.episodeNumbers ?? undefined,
      },
      indexers,
    );

    if (results.length === 0) {
      console.log(
        `[stall-detection] No alternative found for "${row.title}"`,
      );
      return;
    }

    const best = results[0]!;
    console.log(
      `[stall-detection] Auto-retrying with "${best.title}" (confidence: ${best.confidence})`,
    );

    await downloadTorrent(
      db,
      {
        mediaId: row.mediaId,
        title: best.title,
        magnetUrl: best.magnetUrl ?? undefined,
        torrentUrl: best.downloadUrl ?? undefined,
        seasonNumber: row.seasonNumber ?? undefined,
        episodeNumbers: row.episodeNumbers ?? undefined,
      },
      qb,
    );
  } catch (err) {
    console.warn(
      `[stall-detection] Auto-retry failed for "${row.title}":`,
      err instanceof Error ? err.message : err,
    );
  }
}
