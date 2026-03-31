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
    );
  } else {
    await Promise.all(
      sectionIds.map((id) =>
        fetch(
          `${url}/library/sections/${id}/refresh?X-Plex-Token=${token}`,
        ).catch(() => {}),
      ),
    );
  }
}
