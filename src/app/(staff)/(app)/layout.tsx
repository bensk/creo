import { requireViewer } from "@/core/auth/server";
import { DevSwitchUser } from "@/core/auth/DevSignInLink";
import { SignOutButton } from "@/core/auth/SignOutButton";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer("staff");
  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <span className="font-semibold text-brand-charcoal">Creo SIS</span>
        <div className="flex items-center gap-4 text-sm">
          <DevSwitchUser />
          <span>
            {viewer.displayName} · {viewer.roles.join(", ")}
          </span>
          <SignOutButton surface="staff" />
        </div>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
