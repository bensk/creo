// Plain explanations for staff sign-in refusals (?error= on /sign-in).
// Student-facing versions live in messages/<locale>.json under "signInErrors".
export const STAFF_SIGN_IN_ERRORS: Readonly<Record<string, string>> = {
  not_configured: "Google sign-in isn't set up yet.",
  cancelled: "Sign-in was cancelled. Try again when you're ready.",
  expired: "That sign-in took too long. Please try again.",
  state_mismatch: "That sign-in link didn't match. Please try again.",
  nonce_mismatch: "That sign-in didn't check out. Please try again.",
  google_error: "Google didn't complete the sign-in. Please try again.",
  wrong_domain: "Use your @creoprep.org Google account.",
  unverified_email: "Google hasn't verified this account's email address.",
  no_account: "This Google account doesn't have access to Creo SIS yet. Ask an admin to check your account.",
  account_mismatch: "This email is linked to a different Google account. Ask an admin to check your account.",
  not_student_account: "Students sign in to the student portal at /student.",
  directory_unavailable: "Sign-in couldn't check your account with Google. Please try again in a minute.",
  no_access: "Your account doesn't have a role in Creo SIS yet. Ask an admin to check your account.",
  wrong_surface: "This account belongs to a different part of Creo SIS.",
  disabled: "This account is turned off. Ask an admin if that's a mistake.",
  no_user: "This Google account doesn't have access to Creo SIS yet.",
};
