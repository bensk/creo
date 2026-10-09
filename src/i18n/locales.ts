// Languages the student and family portals ship in. Adding one means adding
// messages/<code>.json with every key; a test fails if any key is missing.
export const LOCALES = ["en", "es"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "creo_locale";
export const LOCALE_NAMES: Readonly<Record<Locale, string>> = { en: "English", es: "Español" };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}
