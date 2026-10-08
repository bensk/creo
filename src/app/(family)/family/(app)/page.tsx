import { requireViewer } from "@/core/auth/server";

export default async function FamilyHome() {
  const viewer = await requireViewer("family");
  const es = viewer.language === "es";
  return (
    <section>
      <h1 className="text-2xl font-semibold text-brand-charcoal">
        {es ? `Hola, ${viewer.displayName}` : `Hello, ${viewer.displayName}`}
      </h1>
      <p className="mt-2">
        {es
          ? `Tiene acceso a ${viewer.studentIds.length} estudiante(s).`
          : `You have access to ${viewer.studentIds.length} student(s).`}
      </p>
    </section>
  );
}
