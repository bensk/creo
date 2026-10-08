import { getTranslations } from "next-intl/server";
import { requireViewer } from "@/core/auth/server";

export default async function StudentHome() {
  const viewer = await requireViewer("student");
  const t = await getTranslations("student");
  return (
    <section className="grid gap-3">
      <h1 className="text-3xl font-bold tracking-tight">{t("greeting", { name: viewer.displayName })}</h1>
      <p className="text-lg">{t("comingSoon")}</p>
    </section>
  );
}
