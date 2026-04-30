import type { PlexAdapterPort } from "@canto/core/domain/media-servers/ports/plex-adapter.port";
import {
  authenticatePlexServerToken,
  checkPlexTvPin,
  createPlexTvPin,
  getPlexItem,
  getPlexSections,
  getPlexTvServerResource,
  getPlexTvUser,
  lockPlexFields,
  matchPlexItem,
  plexTvSignIn,
  scanPlexLibrary,
  testPlexConnection,
} from "@canto/core/infra/media-servers/plex.adapter";

/** Wraps the pure Plex HTTP functions as a `PlexAdapterPort`. The adapter is
 *  stateless — composition roots (router, worker) can construct one per call
 *  or share a singleton; both are equivalent. */
export function makePlexAdapter(): PlexAdapterPort {
  return {
    authenticateServerToken: (url, token) => authenticatePlexServerToken(url, token),
    plexTvSignIn: (email, password) => plexTvSignIn(email, password),
    createPin: (clientId) => createPlexTvPin(clientId),
    checkPin: (clientId, pinId) => checkPlexTvPin(clientId, pinId),
    getTvUser: (clientId, token) => getPlexTvUser(clientId, token),
    getTvServerResource: (clientId, token) => getPlexTvServerResource(clientId, token),
    testConnection: (url, token) => testPlexConnection(url, token),
    getSections: (url, token) => getPlexSections(url, token),
    getItem: (url, token, ratingKey) => getPlexItem(url, token, ratingKey),
    matchItem: (url, token, ratingKey, tmdbId, options) =>
      matchPlexItem(url, token, ratingKey, tmdbId, options),
    lockFields: (url, token, ratingKey, type, fields) =>
      lockPlexFields(url, token, ratingKey, type, fields),
    scanLibrary: (url, token, sectionIds) => scanPlexLibrary(url, token, sectionIds),
  };
}
