import { NextResponse, type NextRequest } from "next/server";
import { SURFACES, surfaceForPath } from "@/core/auth/surfaces";

// Optimistic check only: send anyone without a session cookie for this part of
// the app to its sign-in page. The real check (database session, roles,
// access) happens in every page and server action via requireViewer().
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const surface = SURFACES[surfaceForPath(pathname)];
  if (pathname === surface.signIn || pathname.startsWith(`${surface.signIn}/`)) return NextResponse.next();
  if (request.cookies.has(surface.cookie)) return NextResponse.next();
  return NextResponse.redirect(new URL(surface.signIn, request.url));
}

export const config = {
  // Everything except Next internals, static files, API routes (which check
  // sessions themselves), and dev-only tools.
  matcher: ["/((?!_next/|api/|dev/|favicon\\.ico|.*\\.[a-z0-9]+$).*)"],
};
