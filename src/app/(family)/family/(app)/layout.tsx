import { requireViewer } from "@/core/auth/server";
import { DevSwitchUser } from "@/core/auth/DevSignInLink";
import { SignOutButton } from "@/core/auth/SignOutButton";

// Placeholder copy is shown in English and Spanish until next-intl lands with the app shell.
export default async function FamilyLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer("family");
  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <span className="font-semibold text-brand-charcoal">Creo</span>
        <div className="flex items-center gap-4 text-sm">
          <DevSwitchUser />
          <span>{viewer.displayName}</span>
          <SignOutButton surface="family" label={viewer.language === "es" ? "Cerrar sesión" : "Sign out"} />
        </div>
      </header>
      <main className="p-4">{children}</main>
    </div>
  );
}
