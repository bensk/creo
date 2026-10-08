import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { getViewer } from "@/core/auth/server";
import { SURFACES } from "@/core/auth/surfaces";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE } from "./locales";

// No locale in the URL. A choice made with the language switcher wins; otherwise
// a signed-in family sees the language on their contact record; otherwise English.
export default getRequestConfig(async () => {
  const store = await cookies();
  let locale: string | undefined = store.get(LOCALE_COOKIE)?.value;
  if (!isLocale(locale) && store.has(SURFACES.family.cookie)) {
    locale = (await getViewer("family"))?.language;
  }
  if (!isLocale(locale)) locale = DEFAULT_LOCALE;
  return { locale, messages: (await import(`../../messages/${locale}.json`)).default };
});
