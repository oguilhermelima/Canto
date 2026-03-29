import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@canto/db/client";
import * as schema from "@canto/db/schema";
import { count } from "drizzle-orm";

export const auth = betterAuth({
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
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          // First user becomes admin automatically
          const [result] = await db
            .select({ total: count() })
            .from(schema.user);

          if ((result?.total ?? 0) === 0) {
            return {
              data: {
                ...user,
                role: "admin",
              },
            };
          }

          return { data: user };
        },
      },
    },
  },
});

export type Auth = typeof auth;
