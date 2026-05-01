/* -------------------------------------------------------------------------- */
/*  Jellyfin HTTP adapter — pure functions for all Jellyfin API calls         */
/* -------------------------------------------------------------------------- */

const JELLYFIN_AUTH_HEADER =
  'MediaBrowser Client="Canto", Device="Canto", DeviceId="canto-setup", Version="0.1.0"';

function headers(apiKey: string): HeadersInit {
  return { "X-Emby-Token": apiKey };
}

/**
 * Hit Jellyfin's public system info endpoint. No auth required — used to
 * confirm the URL points to a real Jellyfin server before attempting login.
 * Distinguishes "server unreachable" from "bad credentials".
 */
export async function pingJellyfinPublic(
  url: string,
): Promise<
  | { ok: true; serverName: string; version: string }
  | { ok: false; reason: "unreachable" | "not-jellyfin"; status?: number }
> {
  try {
    const res = await fetch(`${url}/System/Info/Public`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { ok: false, reason: "not-jellyfin", status: res.status };
    const data = (await res.json()) as { ServerName?: string; Version?: string; ProductName?: string };
    if (!data.Version || !data.ServerName) {
      return { ok: false, reason: "not-jellyfin" };
    }
    return { ok: true, serverName: data.ServerName, version: data.Version };
  } catch {
    return { ok: false, reason: "unreachable" };
  }
}

/**
 * Authenticate a Jellyfin user with username + password. Returns the access
 * token and the Jellyfin user id on success. Callers decide how to translate
 * error statuses (401 = bad credentials).
 */
export async function authenticateJellyfinByName(
  url: string,
  username: string,
  password: string,
): Promise<
  | { ok: true; accessToken: string; userId: string; userName: string }
  | { ok: false; status: number }
> {
  const res = await fetch(`${url}/Users/AuthenticateByName`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: JELLYFIN_AUTH_HEADER,
    },
    body: JSON.stringify({ Username: username, Pw: password }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return { ok: false, status: res.status };
  const data = (await res.json()) as {
    AccessToken: string;
    User: { Id: string; Name: string };
  };
  return {
    ok: true,
    accessToken: data.AccessToken,
    userId: data.User.Id,
    userName: data.User.Name,
  };
}

/**
 * Create a persistent Jellyfin API key for the `Canto` app. Best-effort —
 * returns false if the creation request fails. The key is then retrievable
 * via `findJellyfinApiKey`.
 */
export async function createJellyfinApiKey(
  url: string,
  accessToken: string,
): Promise<boolean> {
  const res = await fetch(`${url}/Auth/Keys?App=Canto`, {
    method: "POST",
    headers: headers(accessToken),
    signal: AbortSignal.timeout(10_000),
  });
  return res.ok;
}

/** Look up the `Canto` app key in Jellyfin's key store, if present. */
export async function findJellyfinApiKey(
  url: string,
  accessToken: string,
): Promise<string | null> {
  const res = await fetch(`${url}/Auth/Keys`, {
    headers: headers(accessToken),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    Items: Array<{ AccessToken: string; AppName: string }>;
  };
  return data.Items.find((k) => k.AppName === "Canto")?.AccessToken ?? null;
}

/**
 * Resolve the Jellyfin user id for a given API key by hitting
 * `/Sessions/Current`. Used to confirm a token is still valid + identify the
 * user behind it.
 */
export async function getJellyfinCurrentUserId(
  url: string,
  apiKey: string,
): Promise<string | null> {
  const res = await fetch(`${url}/Sessions/Current`, {
    headers: headers(apiKey),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { UserId: string };
  return data.UserId;
}

/**
 * Test the connection to a Jellyfin server by fetching system info.
 */
export async function testJellyfinConnection(
  url: string,
  apiKey: string,
): Promise<{ serverName: string; version: string }> {
  const res = await fetch(`${url}/System/Info`, {
    headers: headers(apiKey),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const info = (await res.json()) as {
    ServerName: string;
    Version: string;
  };
  return { serverName: info.ServerName, version: info.Version };
}

/**
 * Trigger a full library scan on the Jellyfin server.
 */
export async function scanJellyfinLibrary(
  url: string,
  apiKey: string,
): Promise<void> {
  await fetch(`${url}/Library/Refresh`, {
    method: "POST",
    headers: headers(apiKey),
    signal: AbortSignal.timeout(10_000),
  });
}

/**
 * Trigger a library scan for a specific library, or the full library if no ID is given.
 */
export async function triggerJellyfinScan(
  url: string,
  apiKey: string,
  libraryId?: string,
): Promise<void> {
  const endpoint = libraryId
    ? `${url}/Library/${libraryId}/Refresh`
    : `${url}/Library/Refresh`;
  await fetch(endpoint, {
    method: "POST",
    headers: headers(apiKey),
    signal: AbortSignal.timeout(10_000),
  });
}

/**
 * Retrieve all virtual (library) folders from Jellyfin.
 */
export async function getJellyfinLibraryFolders(
  url: string,
  apiKey: string,
): Promise<
  Array<{ Id: string; Name: string; CollectionType: string; Locations: string[] }>
> {
  const res = await fetch(`${url}/Library/VirtualFolders`, {
    headers: headers(apiKey),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const folders = (await res.json()) as Array<{
    ItemId: string; Name: string; CollectionType: string; Locations: string[];
  }>;
  return folders.map((f) => ({
    Id: f.ItemId, Name: f.Name, CollectionType: f.CollectionType, Locations: f.Locations,
  }));
}

/**
 * Fetch a single item's current metadata from Jellyfin.
 */
export async function getJellyfinItem(
  url: string,
  apiKey: string,
  itemId: string,
): Promise<{ name: string; year?: number; providerIds?: Record<string, string> } | null> {
  try {
    const res = await fetch(
      `${url}/Items/${itemId}?Fields=ProviderIds,ProductionYear`,
      { headers: headers(apiKey), signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { Name: string; ProductionYear?: number; ProviderIds?: Record<string, string> };
    return { name: data.Name, year: data.ProductionYear, providerIds: data.ProviderIds };
  } catch {
    return null;
  }
}

/**
 * Refresh metadata for a specific Jellyfin item (best-effort, never throws).
 *
 * IMPORTANT: uses `Default` mode with `ReplaceAllMetadata=false` so locked
 * fields and existing provider ids are NOT wiped. The previous incarnation
 * used `FullRefresh` + `ReplaceAllMetadata=true` which told Jellyfin to
 * discard everything and re-run the auto-matcher — actively undoing any
 * manual match fix we just applied.
 */
export async function refreshJellyfinItem(
  url: string,
  apiKey: string,
  itemId: string,
): Promise<void> {
  try {
    await fetch(
      `${url}/Items/${itemId}/Refresh?MetadataRefreshMode=Default&ImageRefreshMode=Default&ReplaceAllMetadata=false`,
      {
        method: "POST",
        headers: headers(apiKey),
        signal: AbortSignal.timeout(10_000),
      },
    );
  } catch (err) {
    console.warn(
      `[jellyfin] Failed to refresh item ${itemId}:`,
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * Force a Jellyfin item to re-match against a specific TMDB id.
 *
 * This is the same two-step flow Jellyfin's own web UI performs when a user
 * clicks "Identify…" and picks a result:
 *   1. `POST /Items/RemoteSearch/{Movie|Series}` with a SearchInfo containing
 *      the target TMDB id. Jellyfin queries the configured metadata agents
 *      and returns a list of `RemoteSearchResult` candidates.
 *   2. `POST /Items/RemoteSearch/Apply/{itemId}` with the chosen candidate
 *      as the body. Jellyfin re-pulls metadata from the agent using that
 *      candidate's provider ids and replaces the item's metadata in place.
 *
 * We deliberately do NOT fall back to a naive `POST /Items/{id}` provider-id
 * patch — that endpoint wants the full BaseItemDto payload and is
 * unreliable across Jellyfin versions for just changing provider ids.
 *
 * Throws on any HTTP failure so the caller can surface the error.
 */
export async function applyJellyfinRemoteMatch(
  url: string,
  apiKey: string,
  itemId: string,
  type: "movie" | "show",
  tmdbId: number,
): Promise<void> {
  const endpoint = type === "movie" ? "Movie" : "Series";

  // 1) Ask Jellyfin to query its agents for candidates pinned by tmdbId
  const searchRes = await fetch(`${url}/Items/RemoteSearch/${endpoint}`, {
    method: "POST",
    headers: { ...headers(apiKey), "Content-Type": "application/json" },
    body: JSON.stringify({
      SearchInfo: {
        ProviderIds: { Tmdb: String(tmdbId) },
      },
      IncludeDisabledProviders: false,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!searchRes.ok) {
    throw new Error(
      `Jellyfin RemoteSearch ${endpoint} failed: ${searchRes.status}`,
    );
  }
  const candidates = (await searchRes.json()) as Array<{
    Name?: string;
    ProductionYear?: number;
    ProviderIds?: Record<string, string>;
  }>;
  if (candidates.length === 0) {
    throw new Error(`Jellyfin found no remote candidates for tmdb ${tmdbId}`);
  }

  // Prefer the candidate whose Tmdb id matches exactly; fall back to first.
  const match =
    candidates.find((c) => c.ProviderIds?.Tmdb === String(tmdbId)) ??
    candidates[0];

  // 2) Apply the selected candidate to the item
  const applyRes = await fetch(
    `${url}/Items/RemoteSearch/Apply/${itemId}?replaceAllImages=false`,
    {
      method: "POST",
      headers: { ...headers(apiKey), "Content-Type": "application/json" },
      body: JSON.stringify(match),
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!applyRes.ok) {
    throw new Error(`Jellyfin RemoteSearch Apply failed: ${applyRes.status}`);
  }
}

/**
 * Merge multiple Jellyfin items into a single multi-version entry.
 */
export async function mergeJellyfinVersions(
  url: string,
  apiKey: string,
  ids: string[],
): Promise<void> {
  const res = await fetch(
    `${url}/Videos/MergeVersions?Ids=${ids.join(",")}`,
    {
      method: "POST",
      headers: headers(apiKey),
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!res.ok) {
    throw new Error(`Merge failed: ${res.status}`);
  }
}

/**
 * Mark a Jellyfin library item as played for a specific user.
 *
 * Endpoint: `POST /Users/{userId}/PlayedItems/{itemId}` — this is the same
 * call the Jellyfin web UI issues when you click "mark as played" on an item.
 * For a series item id Jellyfin marks every episode played in one shot.
 */
export async function markJellyfinItemPlayed(
  url: string,
  apiKey: string,
  userId: string,
  itemId: string,
): Promise<void> {
  const res = await fetch(
    `${url}/Users/${userId}/PlayedItems/${itemId}`,
    {
      method: "POST",
      headers: headers(apiKey),
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!res.ok) {
    throw new Error(`Jellyfin mark played failed: ${res.status}`);
  }
}

/**
 * Update a Jellyfin item's playback position for a specific user.
 *
 * Endpoint: `POST /Users/{userId}/Items/{itemId}/UserData`. Jellyfin stores
 * resume position in 100-nanosecond ticks (1 second = 10_000_000 ticks).
 * `Played: true` flips the item to fully watched regardless of position.
 */
export async function setJellyfinPlaybackPosition(
  url: string,
  apiKey: string,
  jellyfinUserId: string,
  itemId: string,
  positionSeconds: number,
  isCompleted: boolean,
): Promise<void> {
  const body = {
    PlaybackPositionTicks: Math.max(0, Math.round(positionSeconds * 10_000_000)),
    Played: isCompleted,
  };
  const res = await fetch(
    `${url}/Users/${jellyfinUserId}/Items/${itemId}/UserData`,
    {
      method: "POST",
      headers: { ...headers(apiKey), "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!res.ok) {
    throw new Error(`Jellyfin set playback position failed: ${res.status}`);
  }
}

/**
 * Mark a Jellyfin library item as unplayed for a specific user.
 */
export async function markJellyfinItemUnplayed(
  url: string,
  apiKey: string,
  userId: string,
  itemId: string,
): Promise<void> {
  const res = await fetch(
    `${url}/Users/${userId}/PlayedItems/${itemId}`,
    {
      method: "DELETE",
      headers: headers(apiKey),
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!res.ok) {
    throw new Error(`Jellyfin mark unplayed failed: ${res.status}`);
  }
}

/**
 * Search a Jellyfin user's library by title and filter client-side to the
 * item whose provider id matches. Supports both tmdb and tvdb so we can
 * resolve shows (typically tvdb-backed) as well as movies. Used by the
 * push-watch-state flow to resolve a Canto media → Jellyfin item id without
 * relying on a pre-synced media_version row.
 */
export async function findJellyfinItemIdByProviderForUser(
  url: string,
  apiKey: string,
  jellyfinUserId: string,
  title: string,
  externalId: number,
  provider: "tmdb" | "tvdb",
): Promise<string | null> {
  if (!title.trim()) return null;
  const searchTerm = encodeURIComponent(title);
  const res = await fetch(
    `${url}/Users/${jellyfinUserId}/Items?Recursive=true&SearchTerm=${searchTerm}&Fields=ProviderIds`,
    { headers: headers(apiKey), signal: AbortSignal.timeout(10_000) },
  );
  if (!res.ok) {
    throw new Error(`Jellyfin search failed: ${res.status}`);
  }
  const data = (await res.json()) as {
    Items?: Array<{ Id: string; ProviderIds?: Record<string, string> }>;
  };
  const providerKey = provider === "tvdb" ? "Tvdb" : "Tmdb";
  const externalIdStr = String(externalId);
  const match = (data.Items ?? []).find(
    (it) => it.ProviderIds?.[providerKey] === externalIdStr,
  );
  return match?.Id ?? null;
}

/**
 * Search Jellyfin for movies matching a Canto media's provider id (tmdb/tvdb).
 *
 * Jellyfin's `/Items` endpoint with `SearchTerm` returns broad matches; we
 * filter client-side by `ProviderIds.Tmdb`/`ProviderIds.Tvdb` to ensure we
 * only collect items that belong to the exact media row. Returns one entry
 * per matching Jellyfin item — multi-version movies return multiple entries
 * with the same base item id are impossible since merge produces one entry,
 * so a single-element result means no merge is needed yet.
 */
/* -------------------------------------------------------------------------- */
/*  Stream-level item info (for MediaFileInfo extraction)                      */
/*                                                                            */
/*  Type shapes live in `domain/media-servers/types/streams.ts`; re-exported */
/*  here so existing consumers keep working until they migrate to the port.  */
/* -------------------------------------------------------------------------- */

export type {
  JellyfinStreamItem,
  JellyfinStreamMediaSource,
  JellyfinStreamMediaStream,
} from "@canto/core/domain/media-servers/types/streams";

import type { JellyfinStreamItem } from "@canto/core/domain/media-servers/types/streams";

const JELLYFIN_STREAM_FIELDS = "MediaSources,MediaStreams,RunTimeTicks";

/** Fetch a single Jellyfin movie item with its media/stream fields populated. */
export async function fetchJellyfinItemWithStreams(
  url: string,
  apiKey: string,
  itemId: string,
): Promise<JellyfinStreamItem | null> {
  const res = await fetch(
    `${url}/Items/${itemId}?Fields=${JELLYFIN_STREAM_FIELDS}`,
    { headers: headers(apiKey), signal: AbortSignal.timeout(15_000) },
  );
  if (!res.ok) return null;
  return (await res.json()) as JellyfinStreamItem;
}

/**
 * Fetch all episodes under a Jellyfin show id with media/stream fields.
 * Paginates 500 at a time to stay within Jellyfin's request size limits.
 */
export async function fetchJellyfinShowEpisodesWithStreams(
  url: string,
  apiKey: string,
  showId: string,
): Promise<JellyfinStreamItem[]> {
  const results: JellyfinStreamItem[] = [];
  let startIndex = 0;
  while (true) {
    const res = await fetch(
      `${url}/Shows/${showId}/Episodes?Fields=${JELLYFIN_STREAM_FIELDS}&StartIndex=${startIndex}&Limit=500`,
      { headers: headers(apiKey), signal: AbortSignal.timeout(20_000) },
    );
    if (!res.ok) break;
    const data = (await res.json()) as {
      Items: JellyfinStreamItem[];
      TotalRecordCount: number;
    };
    for (const ep of data.Items) results.push(ep);
    startIndex += 500;
    if (startIndex >= data.TotalRecordCount) break;
  }
  return results;
}

export async function findJellyfinMoviesByProviderId(
  url: string,
  apiKey: string,
  media: { title: string; externalId: number; provider: string },
): Promise<Array<{ id: string; name: string; path?: string }>> {
  if (!media.title.trim()) return [];
  const searchTerm = encodeURIComponent(media.title);
  const res = await fetch(
    `${url}/Items?Recursive=true&IncludeItemTypes=Movie&SearchTerm=${searchTerm}&Fields=ProviderIds,Path`,
    { headers: headers(apiKey), signal: AbortSignal.timeout(15_000) },
  );
  if (!res.ok) {
    throw new Error(`Jellyfin search failed: ${res.status}`);
  }
  const data = (await res.json()) as {
    Items?: Array<{
      Id: string;
      Name: string;
      Path?: string;
      ProviderIds?: Record<string, string>;
    }>;
  };
  const providerKey = media.provider === "tvdb" ? "Tvdb" : "Tmdb";
  const externalIdStr = String(media.externalId);
  return (data.Items ?? [])
    .filter((it) => it.ProviderIds?.[providerKey] === externalIdStr)
    .map((it) => ({ id: it.Id, name: it.Name, path: it.Path }));
}

