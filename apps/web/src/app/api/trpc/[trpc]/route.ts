import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@canto/api";
import { db } from "@canto/db/client";

const handler = (req: Request): Promise<Response> =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => ({
      db,
      session: null, // TODO: get session from request
    }),
  });

export { handler as GET, handler as POST };
