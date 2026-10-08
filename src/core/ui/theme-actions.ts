"use server";

import { cookies } from "next/headers";
import { parseTheme, THEME_COOKIE, type Theme } from "./theme";

/** Remembers a theme choice on this device. Not personal data; no session needed. */
export async function setThemeAction(theme: Theme): Promise<void> {
  (await cookies()).set(THEME_COOKIE, parseTheme(theme), {
    path: "/", sameSite: "lax", httpOnly: false, maxAge: 400 * 86_400,
    secure: process.env.NODE_ENV === "production",
  });
}
