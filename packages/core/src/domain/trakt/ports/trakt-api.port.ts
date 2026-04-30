import type {
  TraktDeviceCodeResponse,
  TraktFavoritesRequestBody,
  TraktLastActivities,
  TraktListRequestBody,
  TraktListSummary,
  TraktMediaRef,
  TraktOAuthCredentials,
  TraktPingResult,
  TraktPlaybackProgressRef,
  TraktRatingsRemoveRequestBody,
  TraktRatingsRequestBody,
  TraktTokenResponse,
  TraktUserSettingsResponse,
  TraktWatchedMovie,
  TraktWatchedShow,
} from "@canto/core/domain/trakt/types/trakt-api";

/**
 * `TraktApiPort` covers Trakt's HTTP surface. The methods are 1:1 with the
 * remote API and stateless — auth is always passed in via `accessToken`.
 *
 * Higher-level concerns (refresh-on-401, retry, persistence of refreshed
 * tokens) deliberately stay outside this port. The orchestration layer
 * (`refreshTraktAccessTokenIfNeeded` in infra) wraps individual port calls
 * with those concerns; the port itself just speaks HTTP.
 */
export interface TraktApiPort {
  // ── OAuth / Configuration ──

  getCredentials(): Promise<TraktOAuthCredentials>;
  pingClientId(clientId: string): Promise<TraktPingResult>;
  validateClientCredentials(
    clientId: string,
    clientSecret: string,
  ): Promise<TraktPingResult>;
  createDeviceCode(): Promise<TraktDeviceCodeResponse>;
  exchangeDeviceCode(code: string): Promise<TraktTokenResponse>;
  refreshToken(refreshToken: string): Promise<TraktTokenResponse>;

  // ── User ──

  getUserSettings(accessToken: string): Promise<TraktUserSettingsResponse>;

  // ── Reads ──

  getLastActivities(accessToken: string): Promise<TraktLastActivities>;
  listPersonalLists(
    accessToken: string,
    profileId?: string,
  ): Promise<TraktListSummary[]>;
  listWatchlist(
    accessToken: string,
    profileId?: string,
  ): Promise<TraktMediaRef[]>;
  listListItems(
    accessToken: string,
    listId: number,
    profileId?: string,
  ): Promise<TraktMediaRef[]>;
  listRatings(
    accessToken: string,
    profileId?: string,
  ): Promise<TraktMediaRef[]>;
  listFavorites(
    accessToken: string,
    profileId?: string,
  ): Promise<TraktMediaRef[]>;
  listHistory(
    accessToken: string,
    profileId?: string,
    startAt?: string,
  ): Promise<Array<TraktMediaRef & { remoteHistoryId: number }>>;
  listWatchedMovies(accessToken: string): Promise<TraktWatchedMovie[]>;
  listWatchedShows(accessToken: string): Promise<TraktWatchedShow[]>;
  listPlaybackProgress(
    accessToken: string,
  ): Promise<TraktPlaybackProgressRef[]>;

  // ── Mutations ──

  createList(
    accessToken: string,
    input: {
      name: string;
      description?: string | null;
      privacy?: "private" | "friends" | "public";
    },
  ): Promise<TraktListSummary>;
  deleteList(accessToken: string, listId: number): Promise<void>;
  addItemsToList(
    accessToken: string,
    listId: number,
    body: TraktListRequestBody,
  ): Promise<void>;
  removeItemsFromList(
    accessToken: string,
    listId: number,
    body: TraktListRequestBody,
  ): Promise<void>;
  addToWatchlist(
    accessToken: string,
    body: TraktListRequestBody,
  ): Promise<void>;
  removeFromWatchlist(
    accessToken: string,
    body: TraktListRequestBody,
  ): Promise<void>;
  addRatings(
    accessToken: string,
    body: TraktRatingsRequestBody,
  ): Promise<void>;
  removeRatings(
    accessToken: string,
    body: TraktRatingsRemoveRequestBody,
  ): Promise<void>;
  addFavorites(
    accessToken: string,
    body: TraktFavoritesRequestBody,
  ): Promise<void>;
  removeFavorites(
    accessToken: string,
    body: TraktFavoritesRequestBody,
  ): Promise<void>;
  addHistory(accessToken: string, body: TraktListRequestBody): Promise<void>;
}
