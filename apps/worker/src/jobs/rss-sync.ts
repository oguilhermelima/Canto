import { eq, and } from "drizzle-orm";
import { db } from "@canto/db/client";
import { media, mediaFile } from "@canto/db/schema";
import { getSetting } from "@canto/db/settings";
import { SETTINGS } from "@canto/api/lib/settings-keys";
import { downloadTorrent } from "@canto/api/domain/use-cases/download-torrent";
import { detectQuality, detectSource } from "@canto/api/domain/rules/quality";
import { calculateConfidence } from "@canto/api/domain/rules/scoring";
import { parseSeasons, parseEpisodes } from "@canto/api/domain/rules/parsing";
import { getDownloadClient } from "@canto/api/infrastructure/adapters/download-client-factory";
import { getProwlarrClient } from "@canto/api/infrastructure/adapters/prowlarr";
import {
  findBlocklistByMediaId,
  findMediaByIdWithSeasons,
} from "@canto/api/infrastructure/repositories";
import { logAndSwallow } from "@canto/api/lib/log-error";

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
  const prowlarrEnabled = (await getSetting<boolean>(SETTINGS.PROWLARR_ENABLED)) === true;
  if (!prowlarrEnabled) return;

  // 1. Find monitored shows
  const monitoredShows = await db
    .select({
      id: media.id,
      title: media.title,
      externalId: media.externalId,
      provider: media.provider,
      type: media.type,
    })
    .from(media)
    .where(
      and(
        eq(media.type, "show"),
        eq(media.continuousDownload, true),
      ),
    );

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

  // Build title lookup (lowercase title → show)
  const titleMap = new Map<string, typeof monitoredShows[number]>();
  for (const show of monitoredShows) {
    titleMap.set(show.title.toLowerCase(), show);
  }

  // 3. Match and download
  let downloadCount = 0;

  for (const item of rssItems) {
    try {
      // Parse season/episode from RSS title
      const seasons = parseSeasons(item.title);
      const episodes = parseEpisodes(item.title);
      if (seasons.length === 0) continue; // Can't match without season

      // Try to match against monitored shows by checking if show title appears in RSS title
      let matchedShow: typeof monitoredShows[number] | undefined;
      const lowerTitle = item.title.toLowerCase();

      for (const show of monitoredShows) {
        // Check if show title appears in the RSS item title
        const showWords = show.title.toLowerCase().replace(/[^\w\s]/g, "");
        if (lowerTitle.includes(showWords) || lowerTitle.includes(showWords.replace(/\s+/g, "."))) {
          matchedShow = show;
          break;
        }
      }

      if (!matchedShow) continue;

      // Check scoring
      const quality = detectQuality(item.title);
      const confidence = calculateConfidence(
        item.title, quality, item.indexerFlags ?? [], item.seeders, item.age ?? 0,
        { hasDigitalRelease: true },
      );
      if (confidence <= 0) continue;

      // Check blocklist
      const blocked = await findBlocklistByMediaId(db, matchedShow.id);
      const blockedTitles = new Set(blocked.map((b) => b.title.toLowerCase()));
      if (blockedTitles.has(item.title.toLowerCase())) continue;

      // Check if episodes already downloaded
      const mediaRow = await findMediaByIdWithSeasons(db, matchedShow.id);
      if (!mediaRow) continue;

      const seasonNum = seasons[0]!;
      const seasonRow = mediaRow.seasons?.find((s) => s.number === seasonNum);
      if (!seasonRow?.episodes) continue;

      const targetEpisodes = episodes.length > 0
        ? episodes
        : seasonRow.episodes.map((e) => e.number); // Season pack

      // Check which episodes are missing files
      const missingEpisodes: number[] = [];
      for (const epNum of targetEpisodes) {
        const ep = seasonRow.episodes.find((e) => e.number === epNum);
        if (!ep) continue;

        const existingFile = await db.query.mediaFile.findFirst({
          where: and(
            eq(mediaFile.episodeId, ep.id),
            eq(mediaFile.status, "imported"),
          ),
        });

        if (!existingFile) {
          missingEpisodes.push(epNum);
        }
      }

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
