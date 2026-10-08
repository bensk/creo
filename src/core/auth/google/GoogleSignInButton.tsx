import { googleConfig } from "./config";
import type { GoogleSurface } from "./flow";

/** A plain link (not a form) so it works without JavaScript; the route sets up the handshake. */
export function GoogleSignInButton({ surface, label }: { surface: GoogleSurface; label: string }) {
  if (!googleConfig()) return null;
  return (
    <a
      href={`/api/auth/google/start?surface=${surface}`}
      className="inline-flex min-h-12 items-center justify-center rounded-full bg-ink-title px-6 font-semibold text-surface hover:opacity-90"
    >
      {label}
    </a>
  );
}

export function googleSignInConfigured(): boolean {
  return googleConfig() !== null;
}
