import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Optimistic only: no session cookie on an app page → /sign-in. It never
 * touches the database; requireWorkspace() in the DAL does the real check on every page.
 */
export function proxy(request: NextRequest) {
  // /media/:id files answer for themselves (workspace-checked, 404 otherwise)
  if (request.nextUrl.pathname.startsWith("/media/")) return NextResponse.next();
  if (!getSessionCookie(request, { cookiePrefix: "listsnap" })) {
    const url = new URL("/sign-in", request.url);
    // the query too: a Review link names its listing with ?l=
    url.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/assistant/:path*",
    "/onboarding/:path*",
    "/snap/:path*",
    "/job/:path*",
    "/listings/:path*",
    "/bulk/:path*",
    "/media/:path*",
    "/connections/:path*",
    "/usage/:path*",
    "/settings/:path*",
    "/profile/:path*",
    "/help/:path*",
  ],
};
