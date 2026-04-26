import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const publicPaths = ["/login", "/register", "/api/auth", "/api/trpc", "/api/avatar", "/icon"];

/** Routes that require the admin role — non-admins see a 404. */
const ADMIN_ROUTES = ["/manage", "/download", "/torrents"];
const ADMIN_ROUTE_PATTERNS: RegExp[] = [];

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

  // ── Admin route guard ──
  // Fetch the session once for both the admin check and onboarding validation.
  // better-auth's get-session returns { session, user } with user.role.
  let userRole: string | undefined;
  try {
    const sessionRes = await fetch(new URL("/api/auth/get-session", request.url), {
      headers: { cookie: request.headers.get("cookie") ?? "" },
    });
    if (sessionRes.ok) {
      const session = (await sessionRes.json()) as { user?: { role?: string } } | null;
      userRole = session?.user?.role;
    }
    // Don't wipe cookies on non-2xx — a transient 5xx (DB blip, slow query)
    // would log the user out for what's actually a backend hiccup. Let the
    // request through; tRPC will throw UNAUTHORIZED downstream if the session
    // is genuinely invalid, and the client can recover via re-login.
  } catch {
    // If session check fails, let the app handle it
  }

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
    const systemUrl = new URL("/api/trpc/settings.isOnboardingCompleted", request.url);
    const systemRes = await fetch(systemUrl, {
      headers: { cookie: request.headers.get("cookie") ?? "" },
    });
    if (systemRes.ok) {
      const data = (await systemRes.json()) as { result?: { data?: { json?: boolean } } };
      const systemDone = data.result?.data?.json === true;
      if (!systemDone) {
        if (userRole === "admin") {
          return NextResponse.redirect(new URL("/onboarding", request.url));
        }
      } else {
        const userUrl = new URL("/api/trpc/auth.isOnboardingCompleted", request.url);
        const userRes = await fetch(userUrl, {
          headers: { cookie: request.headers.get("cookie") ?? "" },
        });
        if (userRes.ok) {
          const userData = (await userRes.json()) as { result?: { data?: { json?: boolean } } };
          if (userData.result?.data?.json !== true) {
            return NextResponse.redirect(new URL("/onboarding/user", request.url));
          }
        }
      }
    }
  } catch {
    // If check fails, let the app handle it
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff2?|ttf|css|js|map)).*)",
  ],
};
