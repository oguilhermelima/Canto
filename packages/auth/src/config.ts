import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@canto/db/client";
import * as schema from "@canto/db/schema";
import { count, sql } from "drizzle-orm";
import { onboardNewUser } from "@canto/core/domain/user/use-cases/onboard-new-user";

// Self-hosted boxes commonly serve over a LAN IP. If AUTH_TRUSTED_ORIGINS isn't
// set, prefer BETTER_AUTH_URL (the canonical app origin) over a hardcoded
// localhost fallback — otherwise sign-in from the LAN device fails with
// INVALID_ORIGIN even though the user thought everything was configured.
function defaultTrustedOrigin(): string {
  const baseUrl = process.env.BETTER_AUTH_URL;
  if (baseUrl) {
    try {
      return new URL(baseUrl).origin;
    } catch {
      // fall through
    }
  }
  return "http://localhost:3000";
}

const trustedOrigins = process.env.AUTH_TRUSTED_ORIGINS
  ? process.env.AUTH_TRUSTED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
  : [defaultTrustedOrigin()];

export const auth = betterAuth({
  trustedOrigins,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  emailAndPassword: {
    enabled: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
    // The signed session_data cookie carries the full session+user snapshot,
    // so reads can verify HMAC and return without touching Postgres. We match
    // the cookie's maxAge to expiresIn so the cache covers the entire session
    // lifetime — a shorter TTL forces every request past it back through
    // findSession+updateSession, which is where the cookie-wipe races live.
    // Trade-off: server-side changes to user.role/email/name/image stay stale
    // in the cookie for up to maxAge. changeEmail already wipes the cookie;
    // for role demotions on a self-hosted box, bump `version` below to force
    // a cluster-wide cache invalidation on next request.
    cookieCache: {
      enabled: true,
      maxAge: 60 * 60 * 24 * 7, // 7 days, matches expiresIn
      version: "1",
    },
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        defaultValue: "user",
        input: false,
      },
      // bio and headerImage are profile fields fetched via tRPC, not session
      // data. Keeping them off the session keeps cookieCache small — base64
      // headerImage values used to push the signed cookie past Chromium's
      // response-header cap and break sign-in with ERR_RESPONSE_HEADERS_TOO_BIG.
    },
  },
  // Without this, the drizzle adapter silently drops the `join` parameter,
  // so internalAdapter.findSession's `findOne({ join: { user: true } })`
  // returns the session row alone — and findSession bails with `if (!user)
  // return null`. That null trips deleteSessionCookie inside getSession on
  // any request that misses the cookieCache (e.g. an SSR/RSC fetch without
  // the session_data cookie), wiping both session_token and session_data
  // and logging the user out mid-session. The companion piece is the
  // `users` plural relation alias on session/account in `@canto/db/schema`,
  // which is what the adapter's plural-suffixed `with: { users: ... }`
  // clause resolves against. See better-auth issue #4942.
  experimental: {
    joins: true,
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          // First user becomes admin automatically.
          // Advisory lock serializes concurrent sign-ups to prevent TOCTOU race.
          await db.execute(sql`SELECT pg_advisory_lock(42)`);
          try {
            const [result] = await db
              .select({ total: count() })
              .from(schema.user);

            if (result && result.total === 0) {
              return {
                data: {
                  ...user,
                  role: "admin",
                },
              };
            }

            return { data: user };
          } finally {
            await db.execute(sql`SELECT pg_advisory_unlock(42)`);
          }
        },
        after: async (user) => {
          await onboardNewUser(db, user.id, user.email);
        },
      },
    },
  },
});

export type Auth = typeof auth;
