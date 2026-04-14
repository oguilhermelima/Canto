import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@canto/db/client";
import * as schema from "@canto/db/schema";
import { count, sql } from "drizzle-orm";
import { DEFAULT_HOME_SECTIONS } from "@canto/db/home-section-defaults";
import { DEFAULT_PROFILE_SECTIONS } from "@canto/db/profile-section-defaults";

export const auth = betterAuth({
  trustedOrigins: ["http://localhost:3000", "http://192.168.0.210:3000"],
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
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        defaultValue: "user",
        input: false,
      },
      bio: {
        type: "string",
        required: false,
      },
      headerImage: {
        type: "string",
        required: false,
      },
    },
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
          // Auto-create watchlist for every new user
          await db.insert(schema.list).values({
            userId: user.id,
            name: "Watchlist",
            slug: "watchlist",
            type: "watchlist",
            isSystem: true,
          });

          // Seed default homepage sections
          await db.insert(schema.homeSection).values(
            DEFAULT_HOME_SECTIONS.map((s) => ({ ...s, userId: user.id })),
          );

          // Seed default profile sections
          await db.insert(schema.profileSection).values(
            DEFAULT_PROFILE_SECTIONS.map((s) => ({ ...s, userId: user.id })),
          );
        },
      },
    },
  },
});

export type Auth = typeof auth;
