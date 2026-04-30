import { drizzle  } from "drizzle-orm/postgres-js";
import type {PostgresJsDatabase} from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;

let _db: Database | undefined;

function createDb(): Database {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL environment variable is required");
  }
  return drizzle(
    postgres(url, {
      max: 20,
      // Close connections after 20s idle. Default (0) keeps sockets open
      // indefinitely — fine for web requests, fatal for long-running
      // workers whose pool accumulates half-dead TCP sockets (infra idle
      // kills, Postgres restarts). A stale socket surfaces as a bulk
      // "Failed query" storm the next time the pool is hit.
      idle_timeout: 20,
      // Hard-recycle every 30 min. postgres.js default is a randomized
      // 30–60 min window; pinning it bounds connection age predictably
      // below typical NAT/firewall idle limits.
      max_lifetime: 60 * 30,
    }),
    { schema, casing: "snake_case" },
  );
}

export const db: Database = new Proxy({} as Database, {
  get(_, prop) {
    _db ??= createDb();
    return Reflect.get(_db, prop);
  },
});
