import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;

let _db: Database | undefined;

function createDb(): Database {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL environment variable is required");
  }
  return drizzle(postgres(url, { max: 20 }), { schema, casing: "snake_case" });
}

export const db: Database = new Proxy({} as Database, {
  get(_, prop) {
    _db ??= createDb();
    return Reflect.get(_db, prop);
  },
});
