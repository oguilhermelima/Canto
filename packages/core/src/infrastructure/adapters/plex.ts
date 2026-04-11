/* -------------------------------------------------------------------------- */
/*  Plex HTTP adapter — pure functions for all Plex API calls                 */
/* -------------------------------------------------------------------------- */

/**
 * Generic Plex fetch helper. Appends the token as a query parameter and
 * requests JSON responses.
 */
export async function plexFetch<T>(
  url: string,
  token: string,
  endpoint: string,
): Promise<T> {
  const res = await fetch(`${url}${endpoint}?X-Plex-Token=${token}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`Plex API error: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/**
 * Test the connection to a Plex server by fetching the root resource.
 */
export async function testPlexConnection(
  url: string,
  token: string,
): Promise<{ serverName: string; version: string }> {
  const data = await plexFetch<{
    MediaContainer: { friendlyName: string; version: string };
  }>(url, token, "/");
  return {
    serverName: data.MediaContainer.friendlyName,
    version: data.MediaContainer.version,
  };
}

/**
 * Retrieve all library sections from a Plex server.
 */
export async function getPlexSections(
  url: string,
  token: string,
): Promise<Array<{ key: string; title: string; type: string; Location: Array<{ path: string }> }>> {
  const data = await plexFetch<{
    MediaContainer: {
      Directory: Array<{ key: string; title: string; type: string; Location: Array<{ path: string }> }>;
    };
  }>(url, token, "/library/sections");
  return data.MediaContainer.Directory ?? [];
}

/**
 * Fetch a single item's current metadata from Plex.
 */
export async function getPlexItem(
  url: string,
  token: string,
  ratingKey: string,
): Promise<{ title: string; year?: number } | null> {
  try {
    const data = await plexFetch<{
      MediaContainer: { Metadata?: Array<{ title: string; year?: number }> };
    }>(url, token, `/library/metadata/${ratingKey}`);
    const item = data.MediaContainer.Metadata?.[0];
    return item ? { title: item.title, year: item.year } : null;
  } catch {
    return null;
  }
}

/**
 * Refresh metadata for a specific Plex item (best-effort, never throws).
 *
 * NOTE: a refresh alone does NOT change the match — it just re-reads
 * metadata from the existing agent. Use `matchPlexItem` when you need to
 * force a specific TMDB id.
 */
export async function refreshPlexItem(
  url: string,
  token: string,
  ratingKey: string,
): Promise<void> {
  try {
    await fetch(
      `${url}/library/metadata/${ratingKey}/refresh?X-Plex-Token=${token}`,
      {
        method: "PUT",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      },
    );
  } catch (err) {
    console.warn(
      `[plex] Failed to refresh item ${ratingKey}:`,
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * Force Plex to re-match a specific item to a given TMDB id.
 *
 * Plex doesn't expose a "patch provider id" endpoint directly — the way the
 * web UI's "Fix Match" dialog works is:
 *   1. PUT /library/metadata/{id}/match?guid=<agent-guid>
 *      sets the match to the given canonical guid and pulls metadata.
 *   2. Locking selected fields so a future library scan cannot stomp them.
 *
 * We use the legacy themoviedb agent guid format
 *   `com.plexapp.agents.themoviedb://<tmdbId>?lang=en`
 * which modern Plex servers still accept on `/match` for both the legacy
 * and the new Plex Movie/Show agents.
 *
 * Throws on HTTP failure so the caller can surface a toast / retry.
 */
export async function matchPlexItem(
  url: string,
  token: string,
  ratingKey: string,
  tmdbId: number,
  options: { name?: string; language?: string } = {},
): Promise<void> {
  const language = options.language ?? "en";
  const guid = `com.plexapp.agents.themoviedb://${tmdbId}?lang=${language}`;
  const params = new URLSearchParams({
    guid,
    "X-Plex-Token": token,
  });
  if (options.name) params.set("name", options.name);

  const res = await fetch(
    `${url}/library/metadata/${ratingKey}/match?${params.toString()}`,
    {
      method: "PUT",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!res.ok) {
    throw new Error(`Plex /match failed: ${res.status}`);
  }
}

/**
 * Lock specific fields on a Plex item so future library scans can't
 * overwrite them. Call this right after `matchPlexItem` to pin the fix in
 * place. Best-effort — never throws.
 *
 * `type` is the Plex metadata type: 1 = movie, 2 = show, 4 = episode.
 */
export async function lockPlexFields(
  url: string,
  token: string,
  ratingKey: string,
  type: 1 | 2,
  fields: readonly string[] = ["title", "originalTitle", "year", "thumb", "art"],
): Promise<void> {
  try {
    const params = new URLSearchParams({
      id: ratingKey,
      type: String(type),
      "X-Plex-Token": token,
    });
    for (const field of fields) {
      params.set(`${field}.locked`, "1");
    }
    await fetch(`${url}/library/metadata/${ratingKey}?${params.toString()}`, {
      method: "PUT",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    console.warn(
      `[plex] Failed to lock fields on ${ratingKey}:`,
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * Mark a Plex library item as watched using the scrobble endpoint.
 *
 * Plex's `/:/scrobble` is a GET with no body — passing the ratingKey as
 * `key` flips the item's `viewCount` to 1 on the server.
 */
export async function markPlexItemWatched(
  url: string,
  token: string,
  ratingKey: string,
): Promise<void> {
  const params = new URLSearchParams({
    identifier: "com.plexapp.plugins.library",
    key: ratingKey,
    "X-Plex-Token": token,
  });
  const res = await fetch(`${url}/:/scrobble?${params.toString()}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`Plex scrobble failed: ${res.status}`);
  }
}

/**
 * Mark a Plex library item as unwatched via the unscrobble endpoint.
 */
export async function markPlexItemUnwatched(
  url: string,
  token: string,
  ratingKey: string,
): Promise<void> {
  const params = new URLSearchParams({
    identifier: "com.plexapp.plugins.library",
    key: ratingKey,
    "X-Plex-Token": token,
  });
  const res = await fetch(`${url}/:/unscrobble?${params.toString()}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`Plex unscrobble failed: ${res.status}`);
  }
}

/**
 * Update a Plex item's resume position via the `/:/timeline` endpoint.
 *
 * Plex expects position in milliseconds. For a completed state we fall back
 * to the scrobble endpoint so we don't need the item's duration — `state=stopped`
 * with `time≈duration` on /:/timeline is the web-UI equivalent, but scrobble
 * is a simpler one-shot that doesn't need a duration value we don't always
 * have on hand.
 */
export async function setPlexPlaybackPosition(
  url: string,
  token: string,
  ratingKey: string,
  positionSeconds: number,
  isCompleted: boolean,
): Promise<void> {
  if (isCompleted) {
    await markPlexItemWatched(url, token, ratingKey);
    return;
  }
  const timeMs = Math.max(0, Math.round(positionSeconds * 1000));
  const params = new URLSearchParams({
    ratingKey,
    key: `/library/metadata/${ratingKey}`,
    identifier: "com.plexapp.plugins.library",
    state: "stopped",
    time: String(timeMs),
    "X-Plex-Token": token,
  });
  const res = await fetch(`${url}/:/timeline?${params.toString()}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`Plex timeline update failed: ${res.status}`);
  }
}

/**
 * Search Plex for an item matching a provider id (tmdb or tvdb) by using
 * the global `/hubs/search` endpoint. Used as a fallback by push-watch-state
 * when `media_version` has no Plex mapping yet (e.g. reverse-sync hasn't
 * observed the media on this Plex server).
 *
 * Plex items expose their cross-site ids via the `Guid` array when the
 * request includes `includeGuids=1`. We filter client-side on the array
 * because the legacy `?guid=com.plexapp.agents.themoviedb://...` query
 * parameter only matches items indexed under the legacy movie agent.
 */
export async function findPlexItemIdByProviderId(
  url: string,
  token: string,
  title: string,
  externalId: number,
  provider: "tmdb" | "tvdb",
  type: "movie" | "show",
): Promise<string | null> {
  if (!title.trim()) return null;
  const params = new URLSearchParams({
    query: title,
    includeGuids: "1",
    "X-Plex-Token": token,
  });
  const res = await fetch(`${url}/hubs/search?${params.toString()}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    MediaContainer?: {
      Hub?: Array<{
        type?: string;
        Metadata?: Array<{
          ratingKey?: string;
          type?: string;
          Guid?: Array<{ id: string }>;
        }>;
      }>;
    };
  };

  const wantedType = type === "show" ? "show" : "movie";
  const guidPrefix = `${provider}://${externalId}`;

  for (const hub of data.MediaContainer?.Hub ?? []) {
    if (hub.type && hub.type !== wantedType) continue;
    for (const item of hub.Metadata ?? []) {
      if (!item.ratingKey) continue;
      if (item.type && item.type !== wantedType) continue;
      const hasMatch = item.Guid?.some(
        (g) => g.id === guidPrefix || g.id.startsWith(`${guidPrefix}?`),
      );
      if (hasMatch) return item.ratingKey;
    }
  }
  return null;
}

/**
 * Trigger a library scan on one or more Plex sections.
 * If no section IDs are provided, scans all sections.
 */
export async function scanPlexLibrary(
  url: string,
  token: string,
  sectionIds?: string[],
): Promise<void> {
  if (!sectionIds || sectionIds.length === 0) {
    await fetch(
      `${url}/library/sections/all/refresh?X-Plex-Token=${token}`,
      { signal: AbortSignal.timeout(10_000) },
    );
  } else {
    await Promise.all(
      sectionIds.map((id) =>
        fetch(
          `${url}/library/sections/${id}/refresh?X-Plex-Token=${token}`,
          { signal: AbortSignal.timeout(10_000) },
        ).catch((err) => console.error("[plex] Section refresh failed:", err instanceof Error ? err.message : err)),
      ),
    );
  }
}

