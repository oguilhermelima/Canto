/* -------------------------------------------------------------------------- */
/*  Jellyfin HTTP adapter — pure functions for all Jellyfin API calls         */
/* -------------------------------------------------------------------------- */

function headers(apiKey: string): HeadersInit {
  return { "X-Emby-Token": apiKey };
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
