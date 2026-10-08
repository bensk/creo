// Shown on sign-in pages during local development only. The link target is
// compiled out of production builds (see dev sign-in).
export function DevSignInLink() {
  if (process.env.NODE_ENV !== "development") return null;
  return (
    <p className="mt-6 rounded border border-dashed p-3 text-sm">
      Local development:{" "}
      <a className="underline" href="/dev/sign-in">
        sign in as a test user
      </a>
    </p>
  );
}
