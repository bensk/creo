import { requireViewer } from "@/core/auth/server";

export default async function StudentHome() {
  const viewer = await requireViewer("student");
  return (
    <section>
      <h1 className="text-2xl font-semibold text-brand-charcoal">Hi, {viewer.displayName}</h1>
      <p className="mt-2">Your portal is being built.</p>
    </section>
  );
}
