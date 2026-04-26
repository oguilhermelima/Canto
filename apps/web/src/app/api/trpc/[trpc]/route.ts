import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { getCookieCache } from "better-auth/cookies";
import { appRouter } from "@canto/api";
import { auth } from "@canto/auth";
import { db } from "@canto/db/client";

// Self-hosted instances run over plain HTTP on a LAN IP, so the cookies are
// written without the __Secure- prefix. better-auth's getCookieCache defaults
// to isProduction → __Secure- and would silently miss every read otherwise.
const isSecure = (process.env.BETTER_AUTH_URL ?? "").startsWith("https://");

interface CachedSession {
  session: { id: string; createdAt: Date; updatedAt: Date; userId: string; expiresAt: Date; token: string };
  user: { id: string; name: string; email: string; emailVerified: boolean; createdAt: Date; updatedAt: Date; image?: string | null; role?: string };
  updatedAt: number;
  version?: string;
}

const handler = (req: Request): Promise<Response> =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: async () => {
      // Hot path: verify the signed session_data cookie locally — no DB hit,
      // no Set-Cookie writes, no chance of triggering deleteSessionCookie.
      // This is what every infinite-scroll request lands on.
      const cached = await getCookieCache<CachedSession>(req, { isSecure });

      let session: { user: { id: string; name: string; email: string; role: string } } | null = null;

      if (cached) {
        session = {
          user: {
            id: cached.user.id,
            name: cached.user.name,
            email: cached.user.email,
            role: cached.user.role ?? "user",
          },
        };
      } else {
        // Cold path: cookie is missing/expired/corrupt. Fall back once to the
        // canonical getSession (DB lookup) so a fresh tab or post-rotation
        // request can still authenticate. This response's Set-Cookie headers
        // are discarded — actual cookie refresh happens via /api/auth/* hits
        // from the browser's authClient.useSession.
        const fresh = await auth.api.getSession({ headers: req.headers });
        if (fresh) {
          session = {
            user: {
              id: fresh.user.id,
              name: fresh.user.name,
              email: fresh.user.email,
              role: (fresh.user as { role?: string }).role ?? "user",
            },
          };
        }
      }

      return { db, session };
    },
  });

export { handler as GET, handler as POST };
