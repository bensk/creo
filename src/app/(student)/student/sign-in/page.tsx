import { DevSignInLink } from "@/core/auth/DevSignInLink";

export default function StudentSignIn() {
  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-2xl font-semibold text-brand-charcoal">Student sign-in</h1>
      <p className="mt-3">Sign in with your Creo Google account. Google sign-in is not set up yet.</p>
      <DevSignInLink />
    </main>
  );
}
