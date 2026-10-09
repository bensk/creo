import { getTranslations } from "next-intl/server";
import { DevSwitchUser } from "../auth/DevSignInLink";
import { SignOutButton } from "../auth/SignOutButton";
import type { Surface } from "../auth/surfaces";
import { LanguageSwitcher } from "@/i18n/LanguageSwitcher";

/** Header for the student and family portals: mobile-first, large touch targets. */
export async function PortalHeader({ surface, name }: { surface: Exclude<Surface, "staff">; name?: string }) {
  const t = await getTranslations("common");
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft px-4 py-3">
      <span className="text-lg font-black tracking-tight text-ink-title">
        Creo <span className="text-amber" aria-hidden>●</span>
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <LanguageSwitcher />
        {name && <SignOutButton surface={surface} label={t("signOut")} />}
        <DevSwitchUser />
      </div>
    </header>
  );
}
