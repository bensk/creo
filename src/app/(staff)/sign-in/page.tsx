import { DevSignInLink } from "@/core/auth/DevSignInLink";

export const metadata = { title: "Sign in" };

export default function StaffSignIn() {
  return (
    <main className="mx-auto grid max-w-md gap-3 px-4 py-16">
      <span className="text-lg font-black tracking-tight text-ink-title">
        Creo <span className="text-amber" aria-hidden>●</span>
      </span>
      <h1 className="text-3xl font-bold tracking-tight">Sign in to Creo SIS</h1>
      <p className="text-lg">Staff sign in with their Creo Google account.</p>
      <p className="voice text-ink-muted">google sign-in is not set up yet.</p>
      <DevSignInLink />
    </main>
  );
}
