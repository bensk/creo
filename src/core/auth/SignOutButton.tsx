import { signOutAction } from "./actions";
import type { Surface } from "./surfaces";

export function SignOutButton({ surface, label = "Sign out" }: { surface: Surface; label?: string }) {
  return (
    <form action={signOutAction}>
      <input type="hidden" name="surface" value={surface} />
      <button type="submit" className="min-h-11 rounded-md px-3 text-sm underline">
        {label}
      </button>
    </form>
  );
}
