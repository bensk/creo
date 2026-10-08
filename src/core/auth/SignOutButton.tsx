import { signOutAction } from "./actions";
import type { Surface } from "./surfaces";

export function SignOutButton({ surface, label = "Sign out" }: { surface: Surface; label?: string }) {
  return (
    <form action={signOutAction}>
      <input type="hidden" name="surface" value={surface} />
      <button type="submit" className="rounded px-3 py-1.5 text-sm underline focus-visible:outline-2">
        {label}
      </button>
    </form>
  );
}
