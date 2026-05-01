import type { ServerCredentialsPort } from "@canto/core/domain/media-servers/ports/server-credentials.port";
import {
  getJellyfinCredentials,
  getPlexCredentials,
} from "@canto/core/platform/secrets/server-credentials";

/**
 * Wraps the platform `server-credentials` helpers as a `ServerCredentialsPort`.
 * Stateless — composition roots can construct a fresh instance per call or
 * reuse a singleton; the underlying readers hit the settings store directly.
 */
export function makeServerCredentials(): ServerCredentialsPort {
  return {
    getJellyfin: () => getJellyfinCredentials(),
    getPlex: () => getPlexCredentials(),
  };
}
