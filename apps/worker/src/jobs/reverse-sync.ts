import { db } from "@canto/db/client";
import { getSetting } from "@canto/db/settings";
import { TmdbProvider } from "@canto/providers";
import {
  findEnabledSyncLinks,
} from "@canto/api/infrastructure/repositories";
import { scanJellyfinMedia } from "@canto/api/domain/use-cases/scan-jellyfin-media";
import { scanPlexMedia } from "@canto/api/domain/use-cases/scan-plex-media";
import { processSyncImports } from "@canto/api/domain/use-cases/process-sync-imports";

/* -------------------------------------------------------------------------- */
/*  Individual sync handlers                                                    */
/* -------------------------------------------------------------------------- */

export async function handleJellyfinSync(): Promise<void> {
  const jellyfinUrl = await getSetting<string>("jellyfin.url");
  const jellyfinKey = await getSetting<string>("jellyfin.apiKey");
  const jellyfinEnabled = await getSetting<boolean>("jellyfin.enabled");

  if (!jellyfinEnabled || !jellyfinUrl || !jellyfinKey) {
    console.log("[jellyfin-sync] Jellyfin not enabled or not configured");
    return;
  }

  const syncLinks = await findEnabledSyncLinks(db);
  const linked = syncLinks
    .filter((l) => l.serverType === "jellyfin")
    .map((l) => ({
      jellyfinLibraryId: l.serverLibraryId,
      type: l.contentType ?? "mixed",
      linkId: l.id,
    }));

  if (linked.length === 0) {
    console.log("[jellyfin-sync] No linked Jellyfin libraries");
    return;
  }

  const tmdbApiKey = await getSetting<string>("tmdb.apiKey");
  if (!tmdbApiKey) throw new Error("TMDB API key not configured");
  const tmdb = new TmdbProvider(tmdbApiKey);

  console.log(`[jellyfin-sync] Scanning ${linked.length} Jellyfin libraries...`);
  const items = await scanJellyfinMedia(jellyfinUrl, jellyfinKey, linked);
  await processSyncImports(db, items, "jellyfin-sync", tmdb);
}

export async function handlePlexSync(): Promise<void> {
  const plexUrl = await getSetting<string>("plex.url");
  const plexToken = await getSetting<string>("plex.token");
  const plexEnabled = await getSetting<boolean>("plex.enabled");

  if (!plexEnabled || !plexUrl || !plexToken) {
    console.log("[plex-sync] Plex not enabled or not configured");
    return;
  }

  const plexSyncLinks = await findEnabledSyncLinks(db);
  const linked = plexSyncLinks
    .filter((l) => l.serverType === "plex")
    .map((l) => ({
      plexLibraryId: l.serverLibraryId,
      type: l.contentType ?? "mixed",
      linkId: l.id,
    }));

  if (linked.length === 0) {
    console.log("[plex-sync] No linked Plex libraries");
    return;
  }

  const tmdbApiKey = await getSetting<string>("tmdb.apiKey");
  if (!tmdbApiKey) throw new Error("TMDB API key not configured");
  const tmdb = new TmdbProvider(tmdbApiKey);

  console.log(`[plex-sync] Scanning ${linked.length} Plex libraries...`);
  const items = await scanPlexMedia(plexUrl, plexToken, linked);
  await processSyncImports(db, items, "plex-sync", tmdb);
}
