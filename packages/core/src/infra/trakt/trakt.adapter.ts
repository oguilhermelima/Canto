import { getSetting } from "@canto/db/settings";
import type {
  TraktConnectionCredentials,
  TraktDeviceCodeResponse,
  TraktFavoritesRequestBody,
  TraktIds,
  TraktLastActivities,
  TraktListRequestBody,
  TraktListSummary,
  TraktMediaRef,
  TraktOAuthCredentials,
  TraktPingResult,
  TraktPlaybackProgressRef,
  TraktRatingsRemoveRequestBody,
  TraktRatingsRequestBody,
  TraktRefreshPersistPatch,
  TraktTokenResponse,
  TraktUserSettingsResponse,
  TraktWatchedEpisode,
  TraktWatchedMovie,
  TraktWatchedShow,
} from "@canto/core/domain/trakt/types/trakt-api";

// Re-export domain types so existing infra-side imports keep working.
export type {
  TraktConnectionCredentials,
  TraktDeviceCodeResponse,
  TraktFavoritesRequestBody,
  TraktIds,
  TraktLastActivities,
  TraktListRequestBody,
  TraktListSummary,
  TraktMediaRef,
  TraktOAuthCredentials,
  TraktPingResult,
  TraktPlaybackProgressRef,
  TraktRatingsRemoveRequestBody,
  TraktRatingsRequestBody,
  TraktRefreshPersistPatch,
  TraktTokenResponse,
  TraktUserSettingsResponse,
  TraktWatchedEpisode,
  TraktWatchedMovie,
  TraktWatchedShow,
};

const TRAKT_API_BASE = "https://api.trakt.tv";

export class TraktConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TraktConfigurationError";
  }
}

export class TraktHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "TraktHttpError";
  }
}

export async function getTraktOAuthCredentials(): Promise<TraktOAuthCredentials> {
  const clientId = await getSetting("trakt.clientId");
  const clientSecret = await getSetting("trakt.clientSecret");
  if (!clientId || !clientSecret) {
    throw new TraktConfigurationError(
      "Trakt OAuth is not configured. Set Trakt Client ID and Client Secret in Manage > Services > Trakt.",
    );
  }
  return { clientId, clientSecret };
}

interface TraktRequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  accessToken?: string;
  body?: unknown;
}

function truncateErrorText(text: string, max = 280): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

function formatTraktErrorMessage(
  status: number,
  path: string,
  bodyText: string,
  headers: Headers,
): string {
  const contentType = headers.get("content-type") ?? "";
  const compactBody = bodyText.replace(/\s+/g, " ").trim();
  const isCloudflareBlock = status === 403
    && (contentType.includes("text/html")
      || /cloudflare|you have been blocked|attention required/i.test(compactBody));

  if (isCloudflareBlock) {
    const rayId = headers.get("cf-ray");
    return [
      "Trakt blocked requests from this server IP via Cloudflare.",
      rayId ? `Ray ID: ${rayId}.` : "",
      "Try a different outbound IP/network or contact Trakt support with this Ray ID.",
    ].filter(Boolean).join(" ");
  }

  if (contentType.includes("text/html")) {
    return `Trakt request failed (${status}) for ${path}. Received HTML response instead of API JSON.`;
  }

  return `Trakt request failed (${status}) for ${path}${compactBody ? `: ${truncateErrorText(compactBody)}` : ""}`;
}

/** When `TRAKT_DEBUG=1`, every Trakt request is logged with method, path,
 *  body length, and final status. Body content is truncated and access tokens
 *  are never logged. Off by default — flip on to investigate sync incidents. */
const TRAKT_DEBUG = process.env.TRAKT_DEBUG === "1";

function logTraktRequest(
  method: string,
  path: string,
  body: unknown,
  status: number,
  durationMs: number,
): void {
  if (!TRAKT_DEBUG) return;
  const bodyPreview = body
    ? JSON.stringify(body).slice(0, 500)
    : "";
  console.log(
    `[trakt-http] ${method} ${path} status=${status} duration=${durationMs}ms body=${bodyPreview}`,
  );
}

async function traktRequest<T>(
  path: string,
  opts: TraktRequestOptions = {},
): Promise<T> {
  const { clientId } = await getTraktOAuthCredentials();
  const method = opts.method ?? "GET";
  const start = Date.now();
  const res = await fetch(`${TRAKT_API_BASE}${path}`, {
    method,
    headers: {
      "trakt-api-version": "2",
      "trakt-api-key": clientId,
      "User-Agent": "Canto/1.0 (+https://github.com)",
      Accept: "application/json",
      ...(opts.accessToken
        ? { Authorization: `Bearer ${opts.accessToken}` }
        : {}),
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  logTraktRequest(method, path, opts.body, res.status, Date.now() - start);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new TraktHttpError(
      res.status,
      formatTraktErrorMessage(res.status, path, text, res.headers),
    );
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function traktRequestWithHeaders<T>(
  path: string,
  opts: TraktRequestOptions = {},
): Promise<{ data: T; headers: Headers }> {
  const { clientId } = await getTraktOAuthCredentials();
  const method = opts.method ?? "GET";
  const start = Date.now();
  const res = await fetch(`${TRAKT_API_BASE}${path}`, {
    method,
    headers: {
      "trakt-api-version": "2",
      "trakt-api-key": clientId,
      "User-Agent": "Canto/1.0 (+https://github.com)",
      Accept: "application/json",
      ...(opts.accessToken
        ? { Authorization: `Bearer ${opts.accessToken}` }
        : {}),
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  logTraktRequest(method, path, opts.body, res.status, Date.now() - start);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new TraktHttpError(
      res.status,
      formatTraktErrorMessage(res.status, path, text, res.headers),
    );
  }

  if (res.status === 204) {
    return { data: undefined as T, headers: res.headers };
  }
  return { data: (await res.json()) as T, headers: res.headers };
}

async function traktPaginatedRequest<T>(
  path: string,
  accessToken: string,
): Promise<T[]> {
  const out: T[] = [];
  let page = 1;

  while (true) {
    const sep = path.includes("?") ? "&" : "?";
    const { data, headers } = await traktRequestWithHeaders<T[]>(
      `${path}${sep}page=${page}&limit=100`,
      { accessToken },
    );
    if (data.length === 0) break;
    out.push(...data);

    // The previous fallback was `?? \`${page}\`` — when Trakt omitted the
    // header the loop exited after a single page, silently truncating
    // history/watchlist pulls at 100 items. Treat a missing/unparseable
    // header as "I don't know how many pages" and rely on the `data.length`
    // check above (we'll exit when the next page comes back empty).
    const headerValue = headers.get("x-pagination-page-count");
    if (headerValue) {
      const pageCount = Number.parseInt(headerValue, 10);
      if (Number.isFinite(pageCount) && page >= pageCount) break;
    } else if (data.length < 100) {
      // Less than a full page → there's no next page.
      break;
    }
    page += 1;
  }

  return out;
}

interface TraktListItemResponse {
  listed_at: string;
  type: "movie" | "show";
  movie?: { ids: TraktIds };
  show?: { ids: TraktIds };
}

interface TraktWatchlistItemResponse extends TraktListItemResponse {}

interface TraktRatedItemResponse {
  rated_at: string;
  rating: number;
  type: "movie" | "show";
  movie?: { ids: TraktIds };
  show?: { ids: TraktIds };
}

interface TraktFavoriteItemResponse {
  listed_at: string;
  type: "movie" | "show";
  movie?: { ids: TraktIds };
  show?: { ids: TraktIds };
}

interface TraktHistoryItemResponse {
  id: number;
  watched_at: string;
  type: "movie" | "episode";
  movie?: { ids: TraktIds };
  show?: { ids: TraktIds };
  episode?: { season: number; number: number };
}

interface TraktPlaybackItemResponse {
  id: number;
  progress: number;
  paused_at: string;
  type: "movie" | "episode";
  movie?: { ids: TraktIds; runtime?: number | null };
  show?: { ids: TraktIds };
  episode?: { season: number; number: number; runtime?: number | null };
}


/**
 * Validate a Trakt client id by hitting a cheap public endpoint with it as the
 * `trakt-api-key`. Does not touch the client secret — see
 * `validateTraktClientCredentials` for the full-credentials check.
 */
export async function pingTraktClientId(
  clientId: string,
): Promise<TraktPingResult> {
  try {
    const res = await fetch(`${TRAKT_API_BASE}/genres/movies`, {
      headers: {
        "trakt-api-version": "2",
        "trakt-api-key": clientId,
        "User-Agent": "Canto/1.0 (+https://github.com)",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) return { ok: true };
    const text = await res.text().catch(() => "");
    return {
      ok: false,
      status: res.status,
      reason: formatTraktErrorMessage(res.status, "/genres/movies", text, res.headers),
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      reason: err instanceof Error ? err.message : "Cannot reach Trakt",
    };
  }
}

/**
 * Validate a Trakt client_id + client_secret pair without asking the user to
 * complete a device-code flow. Trakt does not expose a dedicated "verify
 * credentials" endpoint, so we POST a fake device_code to
 * `/oauth/device/token`:
 *   - If client_id / client_secret are wrong → 401 `invalid_client`.
 *   - If credentials are valid → 400 `invalid_grant` (server proved it checked
 *     the client credentials before rejecting the bogus device_code).
 *   - Any 2xx should not happen (would imply Trakt accepted a fake code) but is
 *     treated as a pass for safety.
 */
export async function validateTraktClientCredentials(
  clientId: string,
  clientSecret: string,
): Promise<TraktPingResult> {
  try {
    const res = await fetch(`${TRAKT_API_BASE}/oauth/device/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Canto/1.0 (+https://github.com)",
        Accept: "application/json",
      },
      body: JSON.stringify({
        code: "canto-credential-probe",
        client_id: clientId,
        client_secret: clientSecret,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (res.ok) return { ok: true };

    const text = await res.text().catch(() => "");
    const parsed = parseOAuthError(text);

    if (res.status === 401 || parsed?.error === "invalid_client") {
      return {
        ok: false,
        status: 401,
        reason: "Invalid Trakt Client Secret",
      };
    }

    if (
      res.status === 400
      || res.status === 404
      || res.status === 410
      || parsed?.error === "invalid_grant"
    ) {
      return { ok: true };
    }

    return {
      ok: false,
      status: res.status,
      reason: formatTraktErrorMessage(res.status, "/oauth/device/token", text, res.headers),
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      reason: err instanceof Error ? err.message : "Cannot reach Trakt",
    };
  }
}

function parseOAuthError(text: string): { error?: string } | null {
  try {
    return JSON.parse(text) as { error?: string };
  } catch {
    return null;
  }
}

export async function createTraktDeviceCode(): Promise<TraktDeviceCodeResponse> {
  const { clientId } = await getTraktOAuthCredentials();
  return traktRequest<TraktDeviceCodeResponse>("/oauth/device/code", {
    method: "POST",
    body: { client_id: clientId },
  });
}

export async function exchangeTraktDeviceCode(
  code: string,
): Promise<TraktTokenResponse> {
  const { clientId, clientSecret } = await getTraktOAuthCredentials();
  return traktRequest<TraktTokenResponse>("/oauth/device/token", {
    method: "POST",
    body: {
      code,
      client_id: clientId,
      client_secret: clientSecret,
    },
  });
}

export async function refreshTraktToken(
  refreshToken: string,
): Promise<TraktTokenResponse> {
  const { clientId, clientSecret } = await getTraktOAuthCredentials();
  return traktRequest<TraktTokenResponse>("/oauth/token", {
    method: "POST",
    body: {
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
    },
  });
}

export async function refreshTraktAccessTokenIfNeeded(
  conn: TraktConnectionCredentials,
  persistRefresh: (patch: TraktRefreshPersistPatch) => Promise<void>,
): Promise<{ accessToken: string; tokenResponse?: TraktTokenResponse }> {
  const accessToken = conn.token;
  if (!accessToken) {
    throw new Error(`Trakt connection ${conn.id} has no access token`);
  }

  const expiresAt = conn.tokenExpiresAt;
  const shouldRefresh = !!(
    conn.refreshToken &&
    expiresAt &&
    expiresAt.getTime() <= Date.now() + 30_000
  );

  if (!shouldRefresh) {
    return { accessToken };
  }

  const refreshed = await refreshTraktToken(conn.refreshToken!);
  const nextExpiresAt = new Date(
    (refreshed.created_at + refreshed.expires_in) * 1000,
  );

  await persistRefresh({
    token: refreshed.access_token,
    refreshToken: refreshed.refresh_token,
    tokenExpiresAt: nextExpiresAt,
    staleReason: null,
  });

  return { accessToken: refreshed.access_token, tokenResponse: refreshed };
}

export async function getTraktUserSettings(
  accessToken: string,
): Promise<TraktUserSettingsResponse> {
  return traktRequest<TraktUserSettingsResponse>("/users/settings", {
    accessToken,
  });
}

function toMediaRef(
  item:
    | TraktListItemResponse
    | TraktWatchlistItemResponse
    | TraktRatedItemResponse
    | TraktFavoriteItemResponse
    | TraktHistoryItemResponse,
): TraktMediaRef | null {
  const listedAt =
    "listed_at" in item && typeof item.listed_at === "string"
      ? item.listed_at
      : undefined;
  const ratedAt =
    "rated_at" in item && typeof item.rated_at === "string"
      ? item.rated_at
      : undefined;
  const watchedAt =
    "watched_at" in item && typeof item.watched_at === "string"
      ? item.watched_at
      : undefined;

  if (item.type === "movie" && item.movie?.ids) {
    return {
      type: "movie",
      ids: item.movie.ids,
      listedAt,
      ratedAt,
      watchedAt,
      rating: "rating" in item ? item.rating : undefined,
    };
  }
  if (item.type === "show" && item.show?.ids) {
    return {
      type: "show",
      ids: item.show.ids,
      listedAt,
      ratedAt,
      watchedAt,
      rating: "rating" in item ? item.rating : undefined,
    };
  }
  if (item.type === "episode" && item.show?.ids) {
    return {
      type: "show",
      ids: item.show.ids,
      watchedAt,
      seasonNumber:
        "episode" in item && item.episode ? item.episode.season : undefined,
      episodeNumber:
        "episode" in item && item.episode ? item.episode.number : undefined,
    };
  }
  return null;
}

export async function listTraktPersonalLists(
  accessToken: string,
  profileId = "me",
): Promise<TraktListSummary[]> {
  return traktPaginatedRequest<TraktListSummary>(
    `/users/${encodeURIComponent(profileId)}/lists`,
    accessToken,
  );
}

export async function listTraktWatchlist(
  accessToken: string,
  profileId = "me",
): Promise<TraktMediaRef[]> {
  const rows = await traktPaginatedRequest<TraktWatchlistItemResponse>(
    `/users/${encodeURIComponent(profileId)}/watchlist/movie,show?sort=added,asc`,
    accessToken,
  );
  return rows.map(toMediaRef).filter((v): v is TraktMediaRef => !!v);
}

export async function listTraktListItems(
  accessToken: string,
  listId: number,
  profileId = "me",
): Promise<TraktMediaRef[]> {
  const rows = await traktPaginatedRequest<TraktListItemResponse>(
    `/users/${encodeURIComponent(profileId)}/lists/${listId}/items/movie,show?sort=added,asc`,
    accessToken,
  );
  return rows.map(toMediaRef).filter((v): v is TraktMediaRef => !!v);
}

export async function listTraktRatings(
  accessToken: string,
  profileId = "me",
): Promise<TraktMediaRef[]> {
  const [movies, shows] = await Promise.all([
    traktPaginatedRequest<TraktRatedItemResponse>(
      `/users/${encodeURIComponent(profileId)}/ratings/movies`,
      accessToken,
    ),
    traktPaginatedRequest<TraktRatedItemResponse>(
      `/users/${encodeURIComponent(profileId)}/ratings/shows`,
      accessToken,
    ),
  ]);
  return [...movies, ...shows]
    .map(toMediaRef)
    .filter((v): v is TraktMediaRef => !!v);
}

export async function listTraktFavorites(
  accessToken: string,
  profileId = "me",
): Promise<TraktMediaRef[]> {
  const [movies, shows] = await Promise.all([
    traktPaginatedRequest<TraktFavoriteItemResponse>(
      `/users/${encodeURIComponent(profileId)}/favorites/movies`,
      accessToken,
    ),
    traktPaginatedRequest<TraktFavoriteItemResponse>(
      `/users/${encodeURIComponent(profileId)}/favorites/shows`,
      accessToken,
    ),
  ]);
  return [...movies, ...shows]
    .map(toMediaRef)
    .filter((v): v is TraktMediaRef => !!v);
}

export async function listTraktHistory(
  accessToken: string,
  profileId = "me",
  /** ISO timestamp — Trakt returns only events with `watched_at >= startAt`.
   *  Used as the incremental checkpoint by the coordinator so each pull only
   *  walks the delta since the last successful sync. Omit on the very first
   *  pull to fetch the full history. */
  startAt?: string,
): Promise<Array<TraktMediaRef & { remoteHistoryId: number }>> {
  const params = startAt ? `?start_at=${encodeURIComponent(startAt)}` : "";
  const rows = await traktPaginatedRequest<TraktHistoryItemResponse>(
    `/users/${encodeURIComponent(profileId)}/history${params}`,
    accessToken,
  );
  return rows
    .map((row) => {
      const mapped = toMediaRef(row);
      if (!mapped) return null;
      return { ...mapped, remoteHistoryId: row.id };
    })
    .filter((v): v is TraktMediaRef & { remoteHistoryId: number } => !!v);
}

/* -------------------------------------------------------------------------- */
/*  /sync/last_activities — single probe used by the coordinator              */
/* -------------------------------------------------------------------------- */

interface TraktLastActivitiesResponse {
  movies?: { watched_at?: string; rated_at?: string; paused_at?: string };
  episodes?: { watched_at?: string; rated_at?: string; paused_at?: string };
  shows?: { rated_at?: string };
  seasons?: { rated_at?: string };
  watchlist?: { updated_at?: string };
  favorites?: { updated_at?: string };
  lists?: { updated_at?: string };
}

function maxIso(...values: Array<string | undefined | null>): string | null {
  let best: string | null = null;
  for (const v of values) {
    if (!v) continue;
    if (!best || v > best) best = v;
  }
  return best;
}

export async function getTraktLastActivities(
  accessToken: string,
): Promise<TraktLastActivities> {
  const data = await traktRequest<TraktLastActivitiesResponse>(
    "/sync/last_activities",
    { accessToken },
  );
  return {
    moviesWatchedAt: data.movies?.watched_at ?? null,
    episodesWatchedAt: data.episodes?.watched_at ?? null,
    historyAt: maxIso(data.movies?.watched_at, data.episodes?.watched_at),
    watchlistAt: data.watchlist?.updated_at ?? null,
    ratingsAt: maxIso(
      data.movies?.rated_at,
      data.shows?.rated_at,
      data.seasons?.rated_at,
      data.episodes?.rated_at,
    ),
    favoritesAt: data.favorites?.updated_at ?? null,
    listsAt: data.lists?.updated_at ?? null,
    playbackAt: maxIso(data.movies?.paused_at, data.episodes?.paused_at),
  };
}

/* -------------------------------------------------------------------------- */
/*  /sync/watched — consolidated "what is watched" view                       */
/*                                                                            */
/*  Unlike /history (events), /sync/watched returns the *current* watched     */
/*  state per item: a movie is here iff plays >= 1; a show entry contains     */
/*  every season/episode the user has played at least once. This is what      */
/*  drives the watched-flag in our UI (`userPlaybackProgress.isCompleted`).   */
/* -------------------------------------------------------------------------- */

interface TraktWatchedMovieResponse {
  plays: number;
  last_watched_at: string;
  movie: { ids: TraktIds };
}

interface TraktWatchedShowResponse {
  plays: number;
  last_watched_at: string;
  show: { ids: TraktIds };
  seasons?: Array<{
    number: number;
    episodes: Array<{
      number: number;
      plays: number;
      last_watched_at: string;
    }>;
  }>;
}

export async function listTraktWatchedMovies(
  accessToken: string,
): Promise<TraktWatchedMovie[]> {
  const rows = await traktRequest<TraktWatchedMovieResponse[]>(
    "/sync/watched/movies",
    { accessToken },
  );
  return rows
    .filter((row) => !!row.movie?.ids)
    .map((row) => ({
      ids: row.movie.ids,
      plays: row.plays,
      lastWatchedAt: row.last_watched_at,
    }));
}

export async function listTraktWatchedShows(
  accessToken: string,
): Promise<TraktWatchedShow[]> {
  const rows = await traktRequest<TraktWatchedShowResponse[]>(
    "/sync/watched/shows",
    { accessToken },
  );
  return rows
    .filter((row) => !!row.show?.ids)
    .map((row) => ({
      ids: row.show.ids,
      plays: row.plays,
      lastWatchedAt: row.last_watched_at,
      episodes: (row.seasons ?? []).flatMap((s) =>
        s.episodes.map((ep) => ({
          seasonNumber: s.number,
          episodeNumber: ep.number,
          plays: ep.plays,
          lastWatchedAt: ep.last_watched_at,
        })),
      ),
    }));
}

export async function listTraktPlaybackProgress(
  accessToken: string,
): Promise<TraktPlaybackProgressRef[]> {
  const rows = await traktRequest<TraktPlaybackItemResponse[]>(
    "/sync/playback?extended=full&limit=100",
    { accessToken },
  );
  const out: TraktPlaybackProgressRef[] = [];
  for (const row of rows) {
    if (row.type === "movie" && row.movie?.ids) {
      out.push({
        type: "movie",
        ids: row.movie.ids,
        pausedAt: row.paused_at,
        progressPercent: row.progress,
        runtimeMinutes: row.movie.runtime ?? null,
        remotePlaybackId: row.id,
      });
      continue;
    }
    if (row.type === "episode" && row.show?.ids && row.episode) {
      out.push({
        type: "show",
        ids: row.show.ids,
        pausedAt: row.paused_at,
        progressPercent: row.progress,
        runtimeMinutes: row.episode.runtime ?? null,
        seasonNumber: row.episode.season,
        episodeNumber: row.episode.number,
        remotePlaybackId: row.id,
      });
    }
  }
  return out;
}

export async function createTraktList(
  accessToken: string,
  input: {
    name: string;
    description?: string | null;
    privacy?: "private" | "friends" | "public";
  },
): Promise<TraktListSummary> {
  return traktRequest<TraktListSummary>("/users/me/lists", {
    method: "POST",
    accessToken,
    body: {
      name: input.name,
      description: input.description ?? undefined,
      privacy: input.privacy ?? "private",
      display_numbers: false,
      allow_comments: false,
      sort_by: "rank",
      sort_how: "asc",
    },
  });
}

export async function deleteTraktList(
  accessToken: string,
  listId: number,
): Promise<void> {
  await traktRequest(`/users/me/lists/${listId}`, {
    method: "DELETE",
    accessToken,
  });
}

export async function addItemsToTraktList(
  accessToken: string,
  listId: number,
  body: TraktListRequestBody,
): Promise<void> {
  await traktRequest(`/users/me/lists/${listId}/items`, {
    method: "POST",
    accessToken,
    body,
  });
}

export async function removeItemsFromTraktList(
  accessToken: string,
  listId: number,
  body: TraktListRequestBody,
): Promise<void> {
  await traktRequest(`/users/me/lists/${listId}/items/remove`, {
    method: "POST",
    accessToken,
    body,
  });
}

export async function addToTraktWatchlist(
  accessToken: string,
  body: TraktListRequestBody,
): Promise<void> {
  await traktRequest("/sync/watchlist", {
    method: "POST",
    accessToken,
    body,
  });
}

export async function removeFromTraktWatchlist(
  accessToken: string,
  body: TraktListRequestBody,
): Promise<void> {
  await traktRequest("/sync/watchlist/remove", {
    method: "POST",
    accessToken,
    body,
  });
}

export async function addTraktRatings(
  accessToken: string,
  body: TraktRatingsRequestBody,
): Promise<void> {
  await traktRequest("/sync/ratings", {
    method: "POST",
    accessToken,
    body,
  });
}

export async function removeTraktRatings(
  accessToken: string,
  body: Omit<TraktRatingsRequestBody, "movies" | "shows" | "seasons" | "episodes"> & {
    movies?: Array<{ ids: TraktIds }>;
    shows?: Array<{ ids: TraktIds }>;
    seasons?: Array<{ ids: TraktIds }>;
    episodes?: Array<{ ids: TraktIds }>;
  },
): Promise<void> {
  await traktRequest("/sync/ratings/remove", {
    method: "POST",
    accessToken,
    body,
  });
}

export async function addTraktFavorites(
  accessToken: string,
  body: TraktFavoritesRequestBody,
): Promise<void> {
  await traktRequest("/sync/favorites", {
    method: "POST",
    accessToken,
    body,
  });
}

export async function removeTraktFavorites(
  accessToken: string,
  body: TraktFavoritesRequestBody,
): Promise<void> {
  await traktRequest("/sync/favorites/remove", {
    method: "POST",
    accessToken,
    body,
  });
}

export async function addTraktHistory(
  accessToken: string,
  body: TraktListRequestBody,
): Promise<void> {
  await traktRequest("/sync/history", {
    method: "POST",
    accessToken,
    body,
  });
}
