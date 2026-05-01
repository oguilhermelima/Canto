import type { TraktAuthPort } from "@canto/core/domain/trakt/ports/trakt-auth.port";
import { refreshTraktAccessTokenIfNeeded } from "@canto/core/infra/trakt/trakt.adapter";

/**
 * Adapter binding `TraktAuthPort` to the existing `refreshTraktAccessTokenIfNeeded`
 * helper in `trakt.adapter.ts`. The helper itself stays where it lives so the
 * one-shot `apps/worker/src/scripts/backfill-trakt-timestamps.ts` (which is a
 * composition-root caller, not a domain consumer) can continue to use it
 * directly.
 */
export function makeTraktAuth(): TraktAuthPort {
  return {
    withFreshAccessToken: async (connection, persistRefresh) => {
      const { accessToken } = await refreshTraktAccessTokenIfNeeded(
        connection,
        persistRefresh,
      );
      return { accessToken };
    },
  };
}
