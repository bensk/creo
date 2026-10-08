import { NextResponse, type NextRequest } from "next/server";
import { SURFACES, surfaceForPath } from "@/core/auth/surfaces";

const isDevTool = (pathname: string) => pathname === "/dev" || pathname.startsWith("/dev/");

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Dev-only tools (dev sign-in) don't exist outside `next dev`. Their routes
  // aren't compiled into production builds either; this answers 404 for the
  // whole /dev space before any other route (or a catch-all) can respond.
  if (isDevTool(pathname)) {
    return process.env.NODE_ENV === "development" ? NextResponse.next() : new NextResponse(null, { status: 404 });
  }

  // Optimistic check only: send anyone without a session cookie for this part
  // of the app to its sign-in page. The real check (database session, roles,
  // access) happens in every page and server action via requireViewer().
  const surface = SURFACES[surfaceForPath(pathname)];
  if (pathname === surface.signIn || pathname.startsWith(`${surface.signIn}/`)) return NextResponse.next();
  if (request.cookies.has(surface.cookie)) return NextResponse.next();
  return NextResponse.redirect(new URL(surface.signIn, request.url));
}

export const config = {
  // Everything except Next internals, static files, and API routes (which check
  // sessions themselves).
  matcher: ["/((?!_next/|api/|favicon\\.ico|.*\\.[a-z0-9]+$).*)"],
};
