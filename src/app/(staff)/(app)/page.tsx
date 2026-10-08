import { requireViewer } from "@/core/auth/server";

export default async function StaffHome() {
  const viewer = await requireViewer("staff");
  return (
    <section>
      <h1 className="text-2xl font-semibold text-brand-charcoal">Creo SIS</h1>
      <p className="mt-2">Signed in as {viewer.displayName}.</p>
    </section>
  );
}
