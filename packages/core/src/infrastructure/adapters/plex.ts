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

