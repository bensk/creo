import { requireViewer } from "@/core/auth/server";
import { PortalHeader } from "@/core/ui/PortalHeader";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer("student");
  return (
    <div className="min-h-dvh">
      <PortalHeader surface="student" name={viewer.displayName} />
      <main className="mx-auto max-w-2xl px-4 py-8">{children}</main>
    </div>
  );
}
