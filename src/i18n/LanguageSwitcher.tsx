import { getLocale, getTranslations } from "next-intl/server";
import { setLocaleAction } from "./actions";
import { LOCALE_NAMES, LOCALES } from "./locales";

/** On every student and family page (CLAUDE.md, Family portal). Each language is named in itself. */
export async function LanguageSwitcher() {
  const locale = await getLocale();
  const t = await getTranslations("common");
  return (
    <form action={setLocaleAction} className="flex items-center gap-1" aria-label={t("language")}>
      {LOCALES.map((l) => (
        <button
          key={l}
          type="submit"
          name="locale"
          value={l}
          lang={l}
          aria-pressed={l === locale}
          className="min-h-11 rounded-md px-3 text-sm text-ink-muted aria-pressed:bg-surface-sunken aria-pressed:font-semibold aria-pressed:text-ink-title"
        >
          {LOCALE_NAMES[l]}
        </button>
      ))}
    </form>
  );
}
