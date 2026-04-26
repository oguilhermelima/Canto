import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@canto/db/client";
import * as schema from "@canto/db/schema";
import { count, sql } from "drizzle-orm";
import { onboardNewUser } from "@canto/core/domain/user/use-cases/onboard-new-user";

const trustedOrigins = process.env.AUTH_TRUSTED_ORIGINS
  ? process.env.AUTH_TRUSTED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
  : ["http://localhost:3000"];

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
    // Sign session payload into a cookie so every tRPC call doesn't hit the
    // session table. Without this, parallel prefetches on hover/scroll can
    // overlap a slow getSession query, silently return null, and surface as
    // intermittent 401s in the browser. DB is still consulted every maxAge.
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 minutes
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
