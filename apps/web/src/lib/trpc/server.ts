import "server-only";
import { createCaller } from "@canto/api";
import { db } from "@canto/db/client";

export const api = createCaller({
  db,
  session: null, // TODO: get session from cookies
});
