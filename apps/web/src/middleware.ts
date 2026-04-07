import { type NextRequest, NextResponse } from "next/server";

const publicPaths = ["/login", "/register", "/api/auth", "/api/trpc", "/icon"];

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

  // Check if onboarding is completed — redirect to onboarding if not
  // Use getAll (adminProcedure) to validate session + check onboarding in one call.
  // If session is invalid, getAll returns 401 → skip redirect, let the app handle it.
  try {
    const trpcUrl = new URL("/api/trpc/settings.isOnboardingCompleted", request.url);
    const res = await fetch(trpcUrl, {
      headers: { cookie: request.headers.get("cookie") ?? "" },
    });
    if (res.ok) {
      const data = (await res.json()) as { result?: { data?: { json?: boolean } } };
      if (data.result?.data?.json !== true) {
        // Validate the session is real before redirecting — call an admin endpoint
        const sessionCheck = await fetch(
          new URL("/api/trpc/settings.getAll", request.url),
          { headers: { cookie: request.headers.get("cookie") ?? "" } },
        );
        if (sessionCheck.ok) {
          return NextResponse.redirect(new URL("/onboarding", request.url));
        }
        // Session is invalid — clear the stale cookie and redirect to login
        const loginUrl = new URL("/login", request.url);
        const response = NextResponse.redirect(loginUrl);
        response.cookies.delete("better-auth.session_token");
        response.cookies.delete("__Secure-better-auth.session_token");
        return response;
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
