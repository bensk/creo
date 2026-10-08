// Links to dev sign-in during local development only. The target route is not
// compiled into production builds; these links render nothing there.

function devSignInEnabled(): boolean {
  return process.env.NODE_ENV === "development" && process.env.DEV_SIGN_IN === "true";
}

/** For sign-in pages. */
export function DevSignInLink() {
  if (!devSignInEnabled()) return null;
  return (
    <p className="mt-6 rounded border border-dashed p-3 text-sm">
      Local development:{" "}
      <a className="underline" href="/dev/sign-in">
        sign in as a test user
      </a>
    </p>
  );
}

/** For portal headers, so it's always obvious a test user is signed in. */
export function DevSwitchUser() {
  if (!devSignInEnabled()) return null;
  return (
    <a className="rounded border border-dashed px-2 py-1 text-xs underline" href="/dev/sign-in">
      Dev: switch test user
    </a>
  );
}
