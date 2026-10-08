// The three sign-in surfaces. Each has its own cookie, URL space, and sign-in
// page. This file is imported by proxy.ts, so it must stay free of database
// and Node-only imports.

export type Surface = "staff" | "student" | "family";

export interface SurfaceConfig {
  surface: Surface;
  /** users.kind allowed to hold a session on this surface. */
  userKind: Surface;
  cookie: string;
  /** Cookie path: the student and family cookies are only sent to their own portals. */
  cookiePath: string;
  home: string;
  signIn: string;
}

export const SURFACES: Readonly<Record<Surface, SurfaceConfig>> = {
  staff: {
    surface: "staff", userKind: "staff", cookie: "creo_staff_session", cookiePath: "/",
    home: "/", signIn: "/sign-in",
  },
  student: {
    surface: "student", userKind: "student", cookie: "creo_student_session", cookiePath: "/student",
    home: "/student", signIn: "/student/sign-in",
  },
  family: {
    surface: "family", userKind: "family", cookie: "creo_family_session", cookiePath: "/family",
    home: "/family", signIn: "/family/sign-in",
  },
};

/** Which surface a URL path belongs to. Everything outside /student and /family is staff. */
export function surfaceForPath(pathname: string): Surface {
  if (pathname === "/student" || pathname.startsWith("/student/")) return "student";
  if (pathname === "/family" || pathname.startsWith("/family/")) return "family";
  return "staff";
}
