import { DevSignInLink } from "@/core/auth/DevSignInLink";

export default function StaffSignIn() {
  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-2xl font-semibold text-brand-charcoal">Sign in to Creo SIS</h1>
      <p className="mt-3">Staff sign in with their Creo Google account. Google sign-in is not set up yet.</p>
      <DevSignInLink />
    </main>
  );
}
