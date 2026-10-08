import { notFound } from "next/navigation";
import { devSignInAction } from "@/core/auth/dev/actions";
import { DEV_SIGN_IN_MARKER, devSignInEnabled, devSignInStatus } from "@/core/auth/dev/guard";
import { ALL_PERSONAS, type Persona } from "@/core/seed/personas";

// Local development only. This file is not compiled into production builds.

const REFUSAL_TEXT: Record<string, string> = {
  no_user: "This person has no login. For a family contact, that means they don't have portal access.",
  no_access: "Signed in correctly, but refused: this person has no current access (no role, not enrolled, or no children with portal access).",
  wrong_surface: "This login belongs to a different part of the app.",
  disabled: "This login is disabled.",
};

const GROUPS: { kind: Persona["kind"]; title: string; note: string }[] = [
  { kind: "staff", title: "Staff", note: "Opens the staff app at /" },
  { kind: "student", title: "Students", note: "Opens the student portal at /student" },
  { kind: "family", title: "Families", note: "Opens the family portal at /family" },
];

export default async function DevSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ refused?: string; reason?: string }>;
}) {
  if (!devSignInEnabled()) notFound();
  const status = await devSignInStatus();
  const { refused, reason } = await searchParams;
  const refusedPersona = ALL_PERSONAS.find((p) => p.key === refused);

  return (
    <main className="mx-auto max-w-2xl p-8" data-marker={DEV_SIGN_IN_MARKER}>
      <h1 className="text-3xl font-bold tracking-tight">Sign in as a test user</h1>
      <p className="mt-2 text-sm">
        Local development only. You get a real session, so permissions behave exactly as they will with Google
        sign-in. Each part of the app has its own session, so you can be signed in as staff, a student, and a family at
        once in different tabs.
      </p>

      {!status.allowed && (
        <p role="alert" className="mt-6 rounded-md border-2 border-amber bg-surface-raised p-3">
          {status.reason === "not_seeded"
            ? "The database hasn't been seeded. Run pnpm db:seed, then reload."
            : "Dev sign-in only works against a database on this machine."}
        </p>
      )}

      {refusedPersona && reason && (
        <p role="alert" className="mt-6 rounded-md border-2 border-amber bg-surface-raised p-3">
          <strong>{refusedPersona.label}:</strong> {REFUSAL_TEXT[reason] ?? "Sign-in was refused."}
        </p>
      )}

      {status.allowed &&
        GROUPS.map((group) => (
          <section key={group.kind} className="mt-8">
            <h2 className="text-lg font-semibold">{group.title}</h2>
            <p className="text-sm">{group.note}</p>
            <ul className="mt-3 grid gap-2">
              {ALL_PERSONAS.filter((p) => p.kind === group.kind).map((persona) => (
                <li key={persona.key}>
                  <form action={devSignInAction}>
                    <input type="hidden" name="persona" value={persona.key} />
                    <button
                      type="submit"
                      className="w-full rounded-md border border-line-soft px-4 py-2 text-left hover:bg-surface-raised"
                    >
                      <span className="font-medium">{persona.label}</span>
                      <span className="voice ml-2 text-sm text-ink-muted">
                        {persona.kind === "staff"
                          ? `${persona.givenName} ${persona.familyName}`
                          : `${persona.firstName} ${persona.lastName}`}
                      </span>
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </section>
        ))}
    </main>
  );
}
