/* -------------------------------------------------------------------------- */
/*  Jellyfin library scanner                                                  */
/*                                                                            */
/*  Reads `/Items` and `/Shows/:id/Episodes` and emits canonical              */
/*  ScannedMediaItem values. Movies, series and episodes all flow through a  */
/*  single strategy map so the caller never needs to know the Jellyfin       */
/*  item-type zoo.                                                            */
/* -------------------------------------------------------------------------- */

import {
  SyncAuthError,
  isAuthStatus,
  type ExternalIds,
  type MediaKind,
  type ScannedMediaItem,
  type ScannedPlayback,
} from "./types";

export interface JellyfinLibraryRef {
  /** Jellyfin library (ParentId) */
  jellyfinLibraryId: string;
  /** Library content type: "movies" | "shows" | "mixed". */
  type: string;
  /** folder_server_link FK. */
  linkId: string;
  /**
   * Delta checkpoint — unix millis. When set, the scanner filters to items
   * modified since this timestamp. Undefined means full scan.
   *
   * Series rows are always fetched in full (independent of sinceMs) because
   * the episode mapper relies on parent metadata for external IDs and title
   * fallbacks. Episodes, movies and mixed-library items honor the filter.
   */
  sinceMs?: number;
}

/* -------------------------------------------------------------------------- */
/*  Raw Jellyfin API shapes                                                   */
/* -------------------------------------------------------------------------- */

interface JellyfinProviderIds {
  Tmdb?: string;
  Imdb?: string;
  Tvdb?: string;
}

interface JellyfinUserData {
  PlaybackPositionTicks?: number;
  Played?: boolean;
  LastPlayedDate?: string;
}

interface JellyfinItem {
  Id: string;
  Name: string;
  ProductionYear?: number;
  Path?: string;
  ProviderIds?: JellyfinProviderIds;
  UserData?: JellyfinUserData;
  SeriesId?: string;
  SeriesName?: string;
  ParentIndexNumber?: number;
  IndexNumber?: number;
}

type JellyfinItemType = "Movie" | "Series" | "Episode";

/* -------------------------------------------------------------------------- */
/*  Pure helpers                                                              */
/* -------------------------------------------------------------------------- */

function parseIntSafe(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseJellyfinDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function ticksToSeconds(ticks: number | undefined): number | undefined {
  if (!ticks) return undefined;
  return Math.floor(ticks / 10_000_000);
}

export function parseJellyfinProviderIds(
  raw: JellyfinProviderIds | undefined,
): ExternalIds {
  if (!raw) return {};
  const ids: ExternalIds = {};
  const tmdb = parseIntSafe(raw.Tmdb);
  if (tmdb != null) ids.tmdb = tmdb;
  const tvdb = parseIntSafe(raw.Tvdb);
  if (tvdb != null) ids.tvdb = tvdb;
  if (raw.Imdb) ids.imdb = raw.Imdb;
  return ids;
}

export function buildPlayback(data: JellyfinUserData | undefined): ScannedPlayback {
  return {
    played: data?.Played === true,
    positionSeconds: ticksToSeconds(data?.PlaybackPositionTicks),
    lastPlayedAt: parseJellyfinDate(data?.LastPlayedDate),
  };
}

/* -------------------------------------------------------------------------- */
/*  Item → ScannedMediaItem mappers (strategy map)                            */
/* -------------------------------------------------------------------------- */

/**
 * A ScanContext carries the per-library metadata the mappers need. Keeps
 * the mapper signatures uniform so they can live in a strategy map.
 */
export interface JellyfinMapContext {
  lib: JellyfinLibraryRef;
  /** Map SeriesId → series for episode mappers that need parent metadata. */
  seriesById: Map<string, JellyfinItem>;
}

type JellyfinMapper = (
  item: JellyfinItem,
  ctx: JellyfinMapContext,
) => ScannedMediaItem | null;

const MAPPERS: Record<JellyfinItemType, JellyfinMapper> = {
  Movie: (item, ctx) => {
    if (!item.Id) return null;
    return {
      source: "jellyfin",
      serverItemId: item.Id,
      serverLinkId: ctx.lib.linkId,
      libraryId: null,
      title: item.Name,
      year: item.ProductionYear,
      type: "movie",
      externalIds: parseJellyfinProviderIds(item.ProviderIds),
      path: item.Path,
      playback: buildPlayback(item.UserData),
    };
  },
  Series: (item, ctx) => {
    if (!item.Id) return null;
    return {
      source: "jellyfin",
      serverItemId: item.Id,
      serverLinkId: ctx.lib.linkId,
      libraryId: null,
      title: item.Name,
      year: item.ProductionYear,
      type: "show",
      externalIds: parseJellyfinProviderIds(item.ProviderIds),
      path: item.Path,
      playback: buildPlayback(item.UserData),
    };
  },
  Episode: (item, ctx) => {
    const parent = item.SeriesId ? ctx.seriesById.get(item.SeriesId) : undefined;
    const playback = buildPlayback(item.UserData);

    // Only emit episodes that carry playback data — the series row already
    // represents library membership.
    const hasPlayback =
      playback.played ||
      (playback.positionSeconds ?? 0) > 0 ||
      playback.lastPlayedAt != null;
    if (!hasPlayback) return null;

    const providerIds = parseJellyfinProviderIds(
      parent?.ProviderIds ?? item.ProviderIds,
    );

    // An episode is represented as the series it belongs to, with the
    // episode-level playback data attached.
    return {
      source: "jellyfin",
      serverItemId: parent?.Id ?? item.SeriesId ?? item.Id,
      serverLinkId: ctx.lib.linkId,
      libraryId: null,
      title: parent?.Name ?? item.SeriesName ?? item.Name,
      year: parent?.ProductionYear ?? item.ProductionYear,
      type: "show",
      externalIds: providerIds,
      path: item.Path ?? parent?.Path,
      playback: {
        ...playback,
        seasonNumber: item.ParentIndexNumber,
        episodeNumber: item.IndexNumber,
      },
    };
  },
};

export function mapJellyfinItem(
  type: JellyfinItemType,
  item: JellyfinItem,
  ctx: JellyfinMapContext,
): ScannedMediaItem | null {
  return MAPPERS[type](item, ctx);
}

/* -------------------------------------------------------------------------- */
/*  HTTP layer                                                                */
/* -------------------------------------------------------------------------- */

const PAGE_SIZE = 500;
const REQUEST_TIMEOUT_MS = 30_000;

interface JellyfinItemsResponse {
  Items: JellyfinItem[];
  TotalRecordCount: number;
}

async function fetchItemsPage(
  url: string,
  apiKey: string,
  libraryId: string,
  includeTypes: JellyfinItemType,
  startIndex: number,
  jellyfinUserId: string | undefined,
  sinceMs: number | undefined,
): Promise<JellyfinItemsResponse> {
  const query = new URLSearchParams({
    ParentId: libraryId,
    IncludeItemTypes: includeTypes,
    Fields:
      "ProviderIds,Path,ProductionYear,UserData,SeriesId,SeriesName,ParentIndexNumber,IndexNumber",
    Recursive: "true",
    StartIndex: String(startIndex),
    Limit: String(PAGE_SIZE),
  });
  if (jellyfinUserId) query.set("UserId", jellyfinUserId);
  if (sinceMs != null) {
    query.set("MinDateModified", new Date(sinceMs).toISOString());
  }

  const res = await fetch(`${url}/Items?${query.toString()}`, {
    headers: { "X-Emby-Token": apiKey },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    const msg = `Jellyfin API returned HTTP ${res.status} for library ${libraryId} (${includeTypes}) at offset ${startIndex}`;
    if (isAuthStatus(res.status)) throw new SyncAuthError(msg, res.status);
    throw new Error(msg);
  }
  return (await res.json()) as JellyfinItemsResponse;
}

async function fetchAllItems(
  url: string,
  apiKey: string,
  libraryId: string,
  includeTypes: JellyfinItemType,
  jellyfinUserId: string | undefined,
  sinceMs: number | undefined,
): Promise<JellyfinItem[]> {
  const all: JellyfinItem[] = [];
  let startIndex = 0;

  while (true) {
    const page = await fetchItemsPage(
      url,
      apiKey,
      libraryId,
      includeTypes,
      startIndex,
      jellyfinUserId,
      sinceMs,
    );
    all.push(...page.Items);
    startIndex += PAGE_SIZE;
    if (startIndex >= page.TotalRecordCount) break;
  }

  return all;
}

/* -------------------------------------------------------------------------- */
/*  Library-type dispatch                                                     */
/* -------------------------------------------------------------------------- */

const LIBRARY_TYPE_TO_SCAN_KINDS: Record<string, JellyfinItemType[]> = {
  movies: ["Movie"],
  shows: ["Series", "Episode"],
  mixed: ["Movie", "Series", "Episode"],
};

function kindsForLibrary(libType: string): JellyfinItemType[] {
  return LIBRARY_TYPE_TO_SCAN_KINDS[libType] ?? ["Movie", "Series", "Episode"];
}

async function scanLibrary(
  url: string,
  apiKey: string,
  lib: JellyfinLibraryRef,
  jellyfinUserId: string | undefined,
): Promise<ScannedMediaItem[]> {
  const kinds = kindsForLibrary(lib.type);
  const items: ScannedMediaItem[] = [];

  // Series must be fetched before episodes so the episode mapper can look
  // up parent metadata (title/year/provider ids) in O(1).
  const seriesById = new Map<string, JellyfinItem>();

  for (const kind of kinds) {
    // Series rows must be fetched in full so episode mappers can resolve
    // parent metadata for external IDs and title fallbacks. Movies and
    // episodes honor the delta filter.
    const kindSinceMs = kind === "Series" ? undefined : lib.sinceMs;
    const raw = await fetchAllItems(
      url,
      apiKey,
      lib.jellyfinLibraryId,
      kind,
      jellyfinUserId,
      kindSinceMs,
    );
    if (kind === "Series") {
      for (const item of raw) {
        if (item.Id) seriesById.set(item.Id, item);
      }
    }
    const ctx: JellyfinMapContext = { lib, seriesById };
    for (const rawItem of raw) {
      const mapped = mapJellyfinItem(kind, rawItem, ctx);
      if (mapped) items.push(mapped);
    }
  }

  return items;
}

/**
 * Scan one or more Jellyfin libraries. Any API error propagates — we do not
 * swallow partial failures any more.
 */
export async function scanJellyfinLibraries(
  url: string,
  apiKey: string,
  libs: JellyfinLibraryRef[],
  jellyfinUserId?: string,
): Promise<ScannedMediaItem[]> {
  const all: ScannedMediaItem[] = [];
  for (const lib of libs) {
    const items = await scanLibrary(url, apiKey, lib, jellyfinUserId);
    all.push(...items);
  }
  return all;
}
