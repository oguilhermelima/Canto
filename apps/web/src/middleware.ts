import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const publicPaths = ["/login", "/register", "/api/auth", "/api/trpc", "/api/avatar", "/icon"];

/** Routes that require the admin role — non-admins see a 404. */
const ADMIN_ROUTES = ["/manage", "/torrents"];
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
    } else {
      // Session is invalid — clear the stale cookie and redirect to login
      const loginUrl = new URL("/login", request.url);
      const response = NextResponse.redirect(loginUrl);
      response.cookies.delete("better-auth.session_token");
      response.cookies.delete("__Secure-better-auth.session_token");
      return response;
    }
  } catch {
    // If session check fails, let the app handle it
  }

  if (isAdminRoute(pathname) && userRole !== "admin") {
    return NextResponse.rewrite(new URL("/not-found", request.url));
  }

  // ── Onboarding guard ──
  // Check if onboarding is completed — redirect to onboarding if not.
  try {
    const trpcUrl = new URL("/api/trpc/settings.isOnboardingCompleted", request.url);
    const res = await fetch(trpcUrl, {
      headers: { cookie: request.headers.get("cookie") ?? "" },
    });
    if (res.ok) {
      const data = (await res.json()) as { result?: { data?: { json?: boolean } } };
      if (data.result?.data?.json !== true) {
        // Only admins can complete onboarding — non-admins wait on the home page
        if (userRole === "admin") {
          return NextResponse.redirect(new URL("/onboarding", request.url));
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
