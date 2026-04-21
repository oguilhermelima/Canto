import type { Database } from "@canto/db/client";
import {
  createTraktDeviceCode,
  exchangeTraktDeviceCode,
  getTraktUserSettings,
  pingTraktClientId,
  TraktHttpError,
  validateTraktClientCredentials,
  type TraktDeviceCodeResponse,
} from "../../../../infrastructure/adapters/trakt";
import {
  createUserConnection,
  findUserConnectionByProvider,
  updateUserConnection,
} from "../../../../infrastructure/repositories/media-servers/user-connection";

export interface TraktAuthResult {
  success: boolean;
  error?: string;
}

/**
 * Validate Trakt OAuth credentials before persisting them. Runs two checks:
 *   1. Public API ping with the client_id as `trakt-api-key` — catches typos in
 *      the id with a cheap GET.
 *   2. Device-token probe with a bogus device_code — Trakt validates the
 *      client_id + client_secret pair before rejecting the code, so 401
 *      `invalid_client` cleanly separates bad secrets from bad codes.
 */
export async function authenticateTrakt(input: {
  clientId: string;
  clientSecret: string;
}): Promise<TraktAuthResult> {
  const idCheck = await pingTraktClientId(input.clientId);
  if (!idCheck.ok) {
    if (idCheck.status === 401 || idCheck.status === 403) {
      return { success: false, error: "Invalid Trakt Client ID" };
    }
    if (idCheck.status === 0) {
      return { success: false, error: "Cannot reach Trakt. Check your network and try again." };
    }
    return { success: false, error: idCheck.reason };
  }

  const secretCheck = await validateTraktClientCredentials(input.clientId, input.clientSecret);
  if (!secretCheck.ok) {
    if (secretCheck.status === 0) {
      return { success: false, error: "Cannot reach Trakt. Check your network and try again." };
    }
    return { success: false, error: secretCheck.reason };
  }

  return { success: true };
}

/**
 * Trakt OAuth device flow.
 *
 * This file owns the *auth protocol* — kicking off a device code, polling for
 * a token, and persisting the resulting userConnection. Actual Trakt content
 * sync (watchlist, ratings, history) lives in `use-cases/trakt/` and only
 * consumes the stored connection once the protocol completes.
 */

export function startTraktDeviceAuth(): Promise<TraktDeviceCodeResponse> {
  return createTraktDeviceCode();
}

export type TraktDeviceAuthCheckResult =
  | { authenticated: true; pending: false; expired: false }
  | { authenticated: false; pending: true; expired: false }
  | { authenticated: false; pending: false; expired: true };

export interface CompleteTraktDeviceAuthDeps {
  dispatchUserTraktSync: (userId: string) => Promise<boolean> | Promise<void>;
}

/**
 * Exchange a Trakt device code for an access token, persist a userConnection,
 * and kick off a first sync. Returns the protocol state (authenticated /
 * pending / expired). Any other failure throws so the caller can map it to a
 * transport error.
 */
export async function completeTraktDeviceAuth(
  db: Database,
  userId: string,
  deviceCode: string,
  deps: CompleteTraktDeviceAuthDeps,
): Promise<TraktDeviceAuthCheckResult> {
  try {
    const tokenData = await exchangeTraktDeviceCode(deviceCode);
    const userSettings = await getTraktUserSettings(tokenData.access_token);
    const externalUserId =
      userSettings.user.ids.slug || userSettings.user.username;
    const expiresAt = new Date(
      (tokenData.created_at + tokenData.expires_in) * 1000,
    );

    const existing = await findUserConnectionByProvider(db, userId, "trakt");
    if (existing) {
      await updateUserConnection(db, existing.id, {
        token: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        tokenExpiresAt: expiresAt,
        externalUserId,
        staleReason: null,
      });
    } else {
      await createUserConnection(db, {
        userId,
        provider: "trakt",
        token: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        tokenExpiresAt: expiresAt,
        externalUserId,
      });
    }

    void deps.dispatchUserTraktSync(userId);
    return { authenticated: true, pending: false, expired: false };
  } catch (err) {
    if (err instanceof TraktHttpError && err.status === 400) {
      const message = err.message.toLowerCase();
      if (
        message.includes("expired_token") ||
        message.includes("access_denied") ||
        message.includes("invalid_grant")
      ) {
        return { authenticated: false, pending: false, expired: true };
      }

      // Trakt's device-token endpoint can return bare 400s during polling
      // without a stable error body. Treat unknown 400 as pending so the UI
      // keeps polling instead of showing a hard failure.
      if (
        message.includes("invalid_client") ||
        message.includes("invalid_request") ||
        message.includes("unauthorized_client")
      ) {
        throw err;
      }

      return { authenticated: false, pending: true, expired: false };
    }
    throw err;
  }
}
