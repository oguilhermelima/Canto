import type { TraktApiPort } from "@canto/core/domain/trakt/ports/trakt-api.port";
import {
  addItemsToTraktList,
  addToTraktWatchlist,
  addTraktFavorites,
  addTraktHistory,
  addTraktRatings,
  createTraktDeviceCode,
  createTraktList,
  deleteTraktList,
  exchangeTraktDeviceCode,
  getTraktLastActivities,
  getTraktOAuthCredentials,
  getTraktUserSettings,
  listTraktFavorites,
  listTraktHistory,
  listTraktListItems,
  listTraktPersonalLists,
  listTraktPlaybackProgress,
  listTraktRatings,
  listTraktWatchedMovies,
  listTraktWatchedShows,
  listTraktWatchlist,
  pingTraktClientId,
  refreshTraktToken,
  removeFromTraktWatchlist,
  removeItemsFromTraktList,
  removeTraktFavorites,
  removeTraktRatings,
  validateTraktClientCredentials,
} from "@canto/core/infra/trakt/trakt.adapter";

/**
 * Adapter binding `TraktApiPort` to the existing `trakt.adapter` HTTP client.
 * Pure plumbing — every method forwards 1:1. The port exists so the trakt
 * sync use-cases can be tested with a fake API and so future implementations
 * (a different upstream, a recorded fixture replay) can swap in cleanly.
 */
export function makeTraktApi(): TraktApiPort {
  return {
    // ── OAuth / Configuration ──
    getCredentials: () => getTraktOAuthCredentials(),
    pingClientId: (clientId) => pingTraktClientId(clientId),
    validateClientCredentials: (clientId, clientSecret) =>
      validateTraktClientCredentials(clientId, clientSecret),
    createDeviceCode: () => createTraktDeviceCode(),
    exchangeDeviceCode: (code) => exchangeTraktDeviceCode(code),
    refreshToken: (refreshToken) => refreshTraktToken(refreshToken),

    // ── User ──
    getUserSettings: (accessToken) => getTraktUserSettings(accessToken),

    // ── Reads ──
    getLastActivities: (accessToken) => getTraktLastActivities(accessToken),
    listPersonalLists: (accessToken, profileId) =>
      listTraktPersonalLists(accessToken, profileId),
    listWatchlist: (accessToken, profileId) =>
      listTraktWatchlist(accessToken, profileId),
    listListItems: (accessToken, listId, profileId) =>
      listTraktListItems(accessToken, listId, profileId),
    listRatings: (accessToken, profileId) =>
      listTraktRatings(accessToken, profileId),
    listFavorites: (accessToken, profileId) =>
      listTraktFavorites(accessToken, profileId),
    listHistory: (accessToken, profileId, startAt) =>
      listTraktHistory(accessToken, profileId, startAt),
    listWatchedMovies: (accessToken) => listTraktWatchedMovies(accessToken),
    listWatchedShows: (accessToken) => listTraktWatchedShows(accessToken),
    listPlaybackProgress: (accessToken) =>
      listTraktPlaybackProgress(accessToken),

    // ── Mutations ──
    createList: (accessToken, input) => createTraktList(accessToken, input),
    deleteList: (accessToken, listId) => deleteTraktList(accessToken, listId),
    addItemsToList: (accessToken, listId, body) =>
      addItemsToTraktList(accessToken, listId, body),
    removeItemsFromList: (accessToken, listId, body) =>
      removeItemsFromTraktList(accessToken, listId, body),
    addToWatchlist: (accessToken, body) =>
      addToTraktWatchlist(accessToken, body),
    removeFromWatchlist: (accessToken, body) =>
      removeFromTraktWatchlist(accessToken, body),
    addRatings: (accessToken, body) => addTraktRatings(accessToken, body),
    removeRatings: (accessToken, body) => removeTraktRatings(accessToken, body),
    addFavorites: (accessToken, body) => addTraktFavorites(accessToken, body),
    removeFavorites: (accessToken, body) =>
      removeTraktFavorites(accessToken, body),
    addHistory: (accessToken, body) => addTraktHistory(accessToken, body),
  };
}
