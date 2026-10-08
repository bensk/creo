import { DevSignInLink } from "@/core/auth/DevSignInLink";
import { GoogleSignInButton, googleSignInConfigured } from "@/core/auth/google/GoogleSignInButton";
import { STAFF_SIGN_IN_ERRORS } from "@/core/auth/google/messages";

export const metadata = { title: "Sign in" };

export default async function StaffSignIn({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const message = error ? (STAFF_SIGN_IN_ERRORS[error] ?? "Sign-in didn't work. Please try again.") : null;
  return (
    <main className="mx-auto grid max-w-md gap-4 px-4 py-16">
      <span className="text-lg font-black tracking-tight text-ink-title">
        Creo <span className="text-amber" aria-hidden>●</span>
      </span>
      <h1 className="text-3xl font-bold tracking-tight">Sign in to Creo SIS</h1>
      <p className="text-lg">Staff sign in with their Creo Google account.</p>
      {message && (
        <p role="alert" className="rounded-md border-2 border-amber bg-surface-raised p-3">
          {message}
        </p>
      )}
      <GoogleSignInButton surface="staff" label="Sign in with Google" />
      {!googleSignInConfigured() && <p className="voice text-ink-muted">google sign-in is not set up yet.</p>}
      <DevSignInLink />
    </main>
  );
}
