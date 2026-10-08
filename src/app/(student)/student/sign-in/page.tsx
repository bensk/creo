import { getTranslations } from "next-intl/server";
import { DevSignInLink } from "@/core/auth/DevSignInLink";
import { GoogleSignInButton, googleSignInConfigured } from "@/core/auth/google/GoogleSignInButton";
import { PortalHeader } from "@/core/ui/PortalHeader";

const KNOWN_ERRORS = new Set(["cancelled", "expired", "wrong_domain", "no_account", "not_student_account", "directory_unavailable", "no_access"]);

export default async function StudentSignIn({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const t = await getTranslations("student");
  const errors = await getTranslations("signInErrors");
  const { error } = await searchParams;
  const message = error ? errors(KNOWN_ERRORS.has(error) ? error : "other") : null;
  return (
    <div className="min-h-dvh">
      <PortalHeader surface="student" />
      <main className="mx-auto grid max-w-md gap-4 px-4 py-10">
        <h1 className="text-3xl font-bold tracking-tight">{t("signInTitle")}</h1>
        <p className="text-lg">{t("signInBody")}</p>
        {message && (
          <p role="alert" className="rounded-md border-2 border-amber bg-surface-raised p-3">
            {message}
          </p>
        )}
        <GoogleSignInButton surface="student" label={t("signInButton")} />
        {!googleSignInConfigured() && <p className="voice text-ink-muted">{t("notSetUp")}</p>}
        <DevSignInLink />
      </main>
    </div>
  );
}
