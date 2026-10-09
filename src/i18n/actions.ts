"use server";

import { cookies } from "next/headers";
import { isLocale, LOCALE_COOKIE } from "./locales";

export async function setLocaleAction(formData: FormData): Promise<void> {
  const locale = formData.get("locale");
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/", sameSite: "lax", maxAge: 400 * 86_400, secure: process.env.NODE_ENV === "production",
  });
}
