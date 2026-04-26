import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getCookieCache } from "better-auth/cookies";
import { db } from "@canto/db/client";
import { user } from "@canto/db/schema";
import { getSetting } from "@canto/db/settings";

const publicPaths = ["/login", "/register", "/api/auth", "/api/trpc", "/api/avatar", "/icon"];

/** Routes that require the admin role — non-admins see a 404. */
const ADMIN_ROUTES = ["/manage", "/download", "/torrents"];
const ADMIN_ROUTE_PATTERNS: RegExp[] = [];

// Self-hosted boxes typically run plain HTTP behind a LAN IP, so cookies are
// written without the __Secure- prefix. getCookieCache defaults to
// isProduction → __Secure- and would silently miss every read otherwise.
const isSecure = (process.env.BETTER_AUTH_URL ?? "").startsWith("https://");

interface CachedSession {
  session: { id: string; createdAt: Date; updatedAt: Date; userId: string; expiresAt: Date; token: string };
  user: { id: string; name: string; email: string; emailVerified: boolean; createdAt: Date; updatedAt: Date; role?: string };
  updatedAt: number;
  version?: string;
}

function isAdminRoute(pathname: string): boolean {
  if (ADMIN_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"))) return true;
  return ADMIN_ROUTE_PATTERNS.some((p) => p.test(pathname));
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (publicPaths.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // Legacy route redirect
  if (pathname === "/torrents" || pathname.startsWith("/torrents/")) {
    const redirectedPath = pathname.replace(/^\/torrents/, "/download");
    const redirectUrl = new URL(redirectedPath, request.url);
    redirectUrl.search = request.nextUrl.search;
    return NextResponse.redirect(redirectUrl);
  }

  // Check for session cookie
  const sessionCookie =
    request.cookies.get("better-auth.session_token") ??
    request.cookies.get("__Secure-better-auth.session_token");

  if (!sessionCookie?.value) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Onboarding is always accessible when authenticated
  if (pathname.startsWith("/onboarding")) {
    return NextResponse.next();
  }

  // Verify the signed session_data cookie locally — no internal fetch, no
  // chance of a transient 5xx triggering the old cookie-wipe path. If the
  // cookie is missing or invalid, fall through with no role; the admin route
  // gate will treat the user as non-admin and the protected app routes will
  // 401 downstream.
  const cached = await getCookieCache<CachedSession>(request, { isSecure });
  const userId = cached?.user.id;
  const userRole = cached?.user.role;

  if (isAdminRoute(pathname) && userRole !== "admin") {
    return NextResponse.rewrite(new URL("/not-found", request.url));
  }

  // ── Onboarding guard ──
  // Two gates, in order:
  //  1. System onboarding — admin-wide config (TMDB, Jellyfin/Plex admin creds).
  //     Only admins can complete it; non-admins wait at home until it's done.
  //  2. User onboarding — per-account media server link. Runs for every user
  //     after system onboarding is complete (including admins who skipped it,
  //     though the admin finish path auto-marks it done).
  try {
    const systemDone = (await getSetting("onboarding.completed")) === true;
    if (!systemDone) {
      if (userRole === "admin") {
        return NextResponse.redirect(new URL("/onboarding", request.url));
      }
    } else if (userId) {
      const [row] = await db
        .select({ completed: user.onboardingCompleted })
        .from(user)
        .where(eq(user.id, userId));
      if (row?.completed !== true) {
        return NextResponse.redirect(new URL("/onboarding/user", request.url));
      }
    }
  } catch {
    // If the DB read fails, let the app handle it — better to render and risk
    // a stale onboarding state than to stall every navigation on a backend hiccup.
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff2?|ttf|css|js|map)).*)",
  ],
  runtime: "nodejs",
};
