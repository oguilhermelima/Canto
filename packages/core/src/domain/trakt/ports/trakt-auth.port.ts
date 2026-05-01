import type {
  TraktConnectionCredentials,
  TraktRefreshPersistPatch,
} from "@canto/core/domain/trakt/types/trakt-api";

/**
 * `TraktAuthPort` covers the auth orchestration that wraps a `TraktApiPort`
 * call: produce a usable access token for a given connection, refreshing it
 * (and persisting the refreshed credentials via `persistRefresh`) when the
 * stored token is within the expiry grace window. Kept separate from
 * `TraktApiPort` so the HTTP surface stays stateless and side-effect-free.
 */
export interface TraktAuthPort {
  withFreshAccessToken(
    connection: TraktConnectionCredentials,
    persistRefresh: (patch: TraktRefreshPersistPatch) => Promise<void>,
  ): Promise<{ accessToken: string }>;
}
