import { db } from "@canto/db/client";
import { getSetting } from "@canto/db/settings";
import { downloadTorrent } from "@canto/core/domain/torrents/use-cases/download-torrent";
import { calculateConfidence } from "@canto/core/domain/shared/rules/scoring";
import { resolveMediaFlavor } from "@canto/core/domain/shared/rules/media-flavor";
import { parseReleaseAttributes } from "@canto/core/domain/torrents/rules/release-attributes";
import { parseSeasons, parseEpisodes } from "@canto/core/domain/torrents/rules/parsing";
import { matchRssTitle } from "@canto/core/domain/torrents/rules/rss-matching";
import { detectMissingEpisodes } from "@canto/core/domain/media/use-cases/detect-episode-gaps";
import { getDownloadClient } from "@canto/core/infra/torrent-clients/download-client-factory";
import { getProwlarrClient } from "@canto/core/infra/indexers/prowlarr.adapter";
import {
  findBlocklistByMediaId,
  findMediaByIdWithSeasons,
  findMonitoredShowsForRss,
} from "@canto/core/infra/repositories";
import {
  findDownloadConfig,
  findReleaseGroupLookups,
} from "@canto/core/infra/torrents/download-config-repository";
import { applyAdminDownloadPolicy } from "@canto/core/domain/shared/rules/scoring-rules";

/**
 * RSS Sync: Poll Prowlarr RSS feeds and auto-download matching releases
 * for shows with continuousDownload=true.
 *
 * Flow:
 * 1. Find all monitored shows (continuousDownload=true)
 * 2. Fetch RSS from all Prowlarr indexers (TV category)
 * 3. Match RSS items against monitored shows
 * 4. For undownloaded episodes, auto-download the best match
 */
export async function handleRssSync(): Promise<void> {
  const prowlarrEnabled = (await getSetting("prowlarr.enabled")) === true;
  if (!prowlarrEnabled) return;

  // 1. Find monitored shows
  const monitoredShows = await findMonitoredShowsForRss(db);

  if (monitoredShows.length === 0) return;

  console.log(
    `[rss-sync] ${monitoredShows.length} monitored show(s): ${monitoredShows.map((s) => s.title).join(", ")}`,
  );

  // 2. Fetch RSS from Prowlarr
  const prowlarr = await getProwlarrClient();
  let rssItems;
  try {
    rssItems = await prowlarr.fetchRss([5000]); // TV category
  } catch (err) {
    console.error("[rss-sync] Failed to fetch RSS:", err instanceof Error ? err.message : err);
    return;
  }

  if (rssItems.length === 0) {
    console.log("[rss-sync] No RSS items found");
    return;
  }

  console.log(`[rss-sync] ${rssItems.length} RSS item(s) to process`);

  // Hydrate scoring config + tier lookups once for the whole batch. RSS
  // is admin-scoped (no per-user context), so apply admin policy and
  // skip the per-user prefs layer.
  const [config, allLookups] = await Promise.all([
    findDownloadConfig(db),
    findReleaseGroupLookups(db),
  ]);
  const rules = applyAdminDownloadPolicy(config.rules, config.policy);

  // 3. Match and download
  let downloadCount = 0;

  for (const item of rssItems) {
    try {
      // Parse season/episode from RSS title
      const seasons = parseSeasons(item.title);
      const episodes = parseEpisodes(item.title);
      if (seasons.length === 0) continue;

      // Match against monitored shows
      const matchedShow = matchRssTitle(item.title, monitoredShows);
      if (!matchedShow) continue;

      // Check scoring
      const flavor = resolveMediaFlavor({
        type: matchedShow.type as "movie" | "show",
        originCountry: matchedShow.originCountry,
        originalLanguage: matchedShow.originalLanguage,
        genres: matchedShow.genres,
        genreIds: matchedShow.genreIds,
      });
      const attrs = parseReleaseAttributes({
        title: item.title,
        seeders: item.seeders,
        age: item.age ?? 0,
        flags: item.indexerFlags ?? [],
        flavor,
        releaseGroupLookups: allLookups[flavor],
      });
      const confidence = calculateConfidence(
        attrs,
        { hasDigitalRelease: true },
        rules,
      );
      if (confidence <= 0) continue;

      // Check blocklist
      const blocked = await findBlocklistByMediaId(db, matchedShow.id);
      const blockedTitles = new Set(blocked.map((b) => b.title.toLowerCase()));
      if (blockedTitles.has(item.title.toLowerCase())) continue;

      const seasonNum = seasons[0]!;
      const targetEpisodes = episodes.length > 0
        ? episodes
        : []; // Will be resolved in detectMissingEpisodes

      // Detect which episodes are missing
      const allTargetEps = targetEpisodes.length > 0
        ? targetEpisodes
        : await getAllSeasonEpisodes(seasonNum, matchedShow.id);

      if (allTargetEps.length === 0) continue;

      const missingEpisodes = await detectMissingEpisodes(db, matchedShow.id, seasonNum, allTargetEps);
      if (missingEpisodes.length === 0) continue;

      // Download!
      console.log(
        `[rss-sync] Downloading "${item.title}" for ${matchedShow.title} (${missingEpisodes.length} missing ep(s))`,
      );

      const qb = await getDownloadClient();
      await downloadTorrent(
        db,
        {
          mediaId: matchedShow.id,
          title: item.title,
          magnetUrl: item.magnetUrl ?? undefined,
          torrentUrl: item.downloadUrl ?? undefined,
          seasonNumber: seasonNum,
          episodeNumbers: episodes.length > 0 ? episodes : undefined,
        },
        qb,
      );
      downloadCount++;
    } catch (err) {
      // Skip individual item errors (dedup, blocklist, etc.)
      if (err instanceof Error && err.message.includes("Already downloaded")) continue;
      if (err instanceof Error && err.message.includes("blocklisted")) continue;
      console.warn(
        `[rss-sync] Error processing "${item.title}":`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  if (downloadCount > 0) {
    console.log(`[rss-sync] Started ${downloadCount} download(s)`);
  }
}

async function getAllSeasonEpisodes(seasonNum: number, mediaId: string): Promise<number[]> {
  const mediaRow = await findMediaByIdWithSeasons(db, mediaId);
  if (!mediaRow) return [];
  const seasonRow = mediaRow.seasons?.find((s) => s.number === seasonNum);
  return seasonRow?.episodes?.map((e) => e.number) ?? [];
}
