import { getTranslations } from "next-intl/server";
import { DevSignInLink } from "@/core/auth/DevSignInLink";
import { PortalHeader } from "@/core/ui/PortalHeader";

export default async function StudentSignIn() {
  const t = await getTranslations("student");
  return (
    <div className="min-h-dvh">
      <PortalHeader surface="student" />
      <main className="mx-auto grid max-w-md gap-3 px-4 py-10">
        <h1 className="text-3xl font-bold tracking-tight">{t("signInTitle")}</h1>
        <p className="text-lg">{t("signInBody")}</p>
        <p className="voice text-ink-muted">{t("notSetUp")}</p>
        <DevSignInLink />
      </main>
    </div>
  );
}
