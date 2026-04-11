/* -------------------------------------------------------------------------- */
/*  Plex library scanner                                                      */
/*                                                                            */
/*  Reads Plex `/library/sections/:id/all` pages and emits canonical          */
/*  ScannedMediaItem values. GUID parsing and type resolution are driven by   */
/*  lookup tables instead of if/else chains so adding a new provider ID is    */
/*  a one-line change.                                                        */
/* -------------------------------------------------------------------------- */

import {
  SyncAuthError,
  isAuthStatus,
  type ExternalIds,
  type MediaKind,
  type ScannedMediaItem,
} from "./types";

export interface PlexLibraryRef {
  /** Plex library section id (the number in `/library/sections/:id`). */
  plexLibraryId: string;
  /** Library content type: "movies" | "shows" | "mixed". */
  type: string;
  /** folder_server_link FK — ties scanned items back to a library. */
  linkId: string;
  /**
   * Delta checkpoint — unix millis. When set, the scanner adds
   * `updatedAt>={unix}` to the Plex section fetch so only items modified
   * since the checkpoint come back. Undefined means full scan.
   */
  sinceMs?: number;
}

/* -------------------------------------------------------------------------- */
/*  Raw Plex API shapes                                                       */
/* -------------------------------------------------------------------------- */

interface PlexGuid {
  id: string;
}

interface PlexMetadataItem {
  ratingKey?: string;
  title?: string;
  year?: number;
  type?: string;
  Guid?: PlexGuid[];
  viewCount?: number;
  viewOffset?: number;
  lastViewedAt?: number;
}

interface PlexMediaContainer {
  MediaContainer: {
    totalSize?: number;
    size?: number;
    Metadata?: PlexMetadataItem[];
  };
}

/* -------------------------------------------------------------------------- */
/*  Strategy tables (hashmaps, not if-else)                                   */
/* -------------------------------------------------------------------------- */

/**
 * Parse a single Plex Guid entry into ExternalIds. Key is the scheme
 * prefix; value extracts the payload. Unknown prefixes are simply ignored.
 */
const GUID_PARSERS: Record<string, (value: string) => ExternalIds> = {
  "tmdb://": (v) => {
    const parsed = parseInt(v, 10);
    return Number.isFinite(parsed) ? { tmdb: parsed } : {};
  },
  "imdb://": (v) => (v ? { imdb: v } : {}),
  "tvdb://": (v) => {
    const parsed = parseInt(v, 10);
    return Number.isFinite(parsed) ? { tvdb: parsed } : {};
  },
};

/**
 * Resolve the media kind from the library type + item type. Centralised so
 * the scanner never needs to do nested ternaries.
 */
const LIBRARY_TYPE_RESOLVERS: Record<
  string,
  (itemType: string | undefined) => MediaKind | null
> = {
  movies: () => "movie",
  shows: () => "show",
  mixed: (itemType) => {
    if (itemType === "movie") return "movie";
    if (itemType === "show") return "show";
    return null;
  },
};

/* -------------------------------------------------------------------------- */
/*  Pure helpers                                                              */
/* -------------------------------------------------------------------------- */

export function parsePlexGuids(guids: PlexGuid[] | undefined): ExternalIds {
  const ids: ExternalIds = {};
  if (!guids) return ids;
  for (const { id } of guids) {
    for (const [prefix, parse] of Object.entries(GUID_PARSERS)) {
      if (id.startsWith(prefix)) {
        Object.assign(ids, parse(id.slice(prefix.length)));
        break;
      }
    }
  }
  return ids;
}

export function resolvePlexMediaKind(
  libraryType: string,
  itemType: string | undefined,
): MediaKind | null {
  const resolver = LIBRARY_TYPE_RESOLVERS[libraryType];
  return resolver ? resolver(itemType) : null;
}

/**
 * Turn a Plex metadata row + its library into a ScannedMediaItem.
 * Returns null for items we cannot represent (missing ratingKey or
 * unknown media kind). The scanner logs the skip — this function stays
 * pure so it can be unit-tested.
 */
export function mapPlexItem(
  item: PlexMetadataItem,
  lib: PlexLibraryRef,
): ScannedMediaItem | null {
  if (!item.ratingKey || !item.title) return null;

  const type = resolvePlexMediaKind(lib.type, item.type);
  if (!type) return null;

  const positionSeconds =
    typeof item.viewOffset === "number"
      ? Math.floor(item.viewOffset / 1000)
      : undefined;

  return {
    source: "plex",
    serverItemId: String(item.ratingKey),
    serverLinkId: lib.linkId,
    libraryId: null,
    title: item.title,
    year: item.year,
    type,
    externalIds: parsePlexGuids(item.Guid),
    path: undefined,
    playback: {
      played: (item.viewCount ?? 0) > 0,
      positionSeconds,
      lastPlayedAt:
        typeof item.lastViewedAt === "number"
          ? new Date(item.lastViewedAt * 1000)
          : undefined,
    },
  };
}

/* -------------------------------------------------------------------------- */
/*  HTTP layer                                                                */
/* -------------------------------------------------------------------------- */

const PAGE_SIZE = 100;
const REQUEST_TIMEOUT_MS = 30_000;

async function fetchPlexPage(
  url: string,
  token: string,
  libraryId: string,
  offset: number,
  sinceMs: number | undefined,
): Promise<PlexMediaContainer> {
  const sinceQuery =
    sinceMs != null
      ? `&updatedAt%3E%3D${Math.floor(sinceMs / 1000)}`
      : "";
  const res = await fetch(
    `${url}/library/sections/${libraryId}/all?X-Plex-Token=${token}&includeGuids=1&X-Plex-Container-Start=${offset}&X-Plex-Container-Size=${PAGE_SIZE}${sinceQuery}`,
    {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
  );
  if (!res.ok) {
    const msg = `Plex API returned HTTP ${res.status} for library ${libraryId} at offset ${offset}`;
    if (isAuthStatus(res.status)) throw new SyncAuthError(msg, res.status);
    throw new Error(msg);
  }
  return (await res.json()) as PlexMediaContainer;
}

async function scanLibrary(
  url: string,
  token: string,
  lib: PlexLibraryRef,
): Promise<ScannedMediaItem[]> {
  const items: ScannedMediaItem[] = [];
  let offset = 0;

  while (true) {
    const data = await fetchPlexPage(url, token, lib.plexLibraryId, offset, lib.sinceMs);
    const metadata = data.MediaContainer.Metadata ?? [];

    for (const raw of metadata) {
      const mapped = mapPlexItem(raw, lib);
      if (!mapped) {
        console.warn(
          `[plex-scanner] Skipping item "${raw.title ?? "?"}" — missing ratingKey or unknown type`,
        );
        continue;
      }
      items.push(mapped);
    }

    offset += PAGE_SIZE;
    const totalSize = data.MediaContainer.totalSize ?? 0;
    if (metadata.length < PAGE_SIZE || offset >= totalSize) break;
  }

  return items;
}

/**
 * Scan one or more Plex libraries. Errors are propagated to the caller —
 * silent partial failures have burned us before.
 */
export async function scanPlexLibraries(
  url: string,
  token: string,
  libs: PlexLibraryRef[],
): Promise<ScannedMediaItem[]> {
  const all: ScannedMediaItem[] = [];
  for (const lib of libs) {
    const items = await scanLibrary(url, token, lib);
    all.push(...items);
  }
  return all;
}
