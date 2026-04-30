import type { TorrentInfo } from "@canto/core/domain/shared/ports/download-client";
import {
  parseEpisodes,
  parseSeasons,
} from "@canto/core/domain/torrents/rules/parsing";
import {
  detectQuality,
  detectSource,
} from "@canto/core/domain/torrents/rules/quality";

/**
 * Extract the info-hash from a magnet URI, if present.
 */
export function extractHashFromMagnet(magnetOrUrl: string): string | undefined {
  const match = /xt=urn:btih:([a-zA-Z0-9]+)/i.exec(magnetOrUrl);
  return match?.[1]?.toLowerCase();
}

/**
 * Promise-based sleep — used to space out polling loops while waiting for a
 * torrent client to make something available.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Collapse qBittorrent's live torrent state into the canonical DB status
 * (completed / error / paused / stalled / downloading).
 */
export function mapStatusFromLive(torrent: TorrentInfo): string {
  if (torrent.progress >= 1 || torrent.state === "pausedUP") return "completed";
  if (torrent.state === "error" || torrent.state === "missingFiles") return "error";
  if (torrent.state === "pausedDL") return "paused";
  if (torrent.state.includes("stalled") && torrent.state.includes("DL")) return "stalled";
  return "downloading";
}

export interface InferredDownloadMeta {
  downloadType: "movie" | "season" | "episode";
  seasonNumber: number | null;
  episodeNumbers: number[] | null;
  quality: string;
  source: string;
}

/**
 * Infer download metadata (type / season / episodes / quality / source) from
 * a release title via the existing parsing + quality rules.
 */
export function inferDownloadMeta(title: string): InferredDownloadMeta {
  const seasons = parseSeasons(title);
  const episodes = parseEpisodes(title);
  const downloadType: "movie" | "season" | "episode" =
    episodes.length > 0 ? "episode" : seasons.length > 0 ? "season" : "movie";
  return {
    downloadType,
    seasonNumber: seasons[0] ?? null,
    episodeNumbers: episodes.length > 0 ? episodes : null,
    quality: detectQuality(title),
    source: detectSource(title),
  };
}

export interface TorrentListLike {
  listTorrents(filter?: { hashes?: string[] }): Promise<TorrentInfo[]>;
}

export interface WaitForTorrentOptions {
  knownHashes: Set<string>;
  preferredHash?: string;
}

/**
 * Poll qBittorrent until either the preferred hash shows up, or a new torrent
 * (not in `knownHashes`) appears. Used right after adding a magnet/.torrent to
 * pick up qBit's authoritative hash before persisting it.
 */
export async function waitForTorrent(
  qb: TorrentListLike,
  opts: WaitForTorrentOptions,
): Promise<TorrentInfo | null> {
  for (let attempt = 0; attempt < 15; attempt++) {
    await sleep(1500);
    const listed = opts.preferredHash
      ? await qb.listTorrents({ hashes: [opts.preferredHash] })
      : await qb.listTorrents();
    if (opts.preferredHash) {
      const byHash = listed[0];
      if (byHash) return byHash;
      continue;
    }
    const next = listed.find((t) => !opts.knownHashes.has(t.hash));
    if (next) return next;
  }
  return null;
}
