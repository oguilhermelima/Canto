import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@canto/api";
import { auth } from "@canto/auth";
import { db } from "@canto/db/client";

const handler = (req: Request): Promise<Response> =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: async () => {
      const session = await auth.api.getSession({
        headers: req.headers,
      });

      return {
        db,
        session: session
          ? {
              user: {
                id: session.user.id,
                name: session.user.name,
                email: session.user.email,
                role: (session.user as { role?: string }).role ?? "user",
              },
            }
          : null,
      };
    },
  });

export { handler as GET, handler as POST };
