# 0002 — Google sign-in without Auth.js; Directory checks; how jobs run in Google Cloud

Status: accepted (Ben, October 2026)

## Google sign-in uses Google's own library, not Auth.js

CLAUDE.md originally named Auth.js. Auth.js brings its own session system (its own cookie, its own JWT or database sessions), and Creo SIS already has one: revocable database sessions, one cookie per portal, and a single `createSession` that every sign-in method ends in so permissions and auditing never depend on how someone signed in. Running Auth.js alongside it would mean a second session cookie we never read.

Instead, `src/app/api/auth/google/{start,callback}` run the OAuth 2.0 authorization-code flow with PKCE and an OIDC nonce using `google-auth-library` (Google's official client, which Directory sync also uses). The callback verifies the ID token's signature, audience, issuer, and expiry, then checks on the server that the `hd` claim and the email domain are `creoprep.org` and the email is verified. Accounts are only ever matched, never created. A staff member's first Google sign-in pins their Google account ID; a different Google account with the same email is refused.

## Student accounts are checked against the Directory at sign-in

A student login is accepted only if the Google account is in the `/students` OU (or a graduation-year sub-OU), is not suspended, and has the same Google ID the Directory reports. This is looked up live in the Admin SDK (cached for five minutes) rather than stored, so there is no schema change and the answer is never a day stale. If the Directory is not configured or does not answer, student sign-in is refused (fail closed).

## Directory access

A dedicated service account with domain-wide delegation, read-only Directory scopes only (`admin.directory.user.readonly`, `admin.directory.group.member.readonly`), acting as a Workspace admin. Its key is stored in Secret Manager (`creo-sis-directory-credentials`). A keyless setup (signing the delegation JWT through the IAM Credentials API) is possible later and would remove the stored key.

## Directory sync

`pnpm directory:sync` creates, updates, and deactivates staff (everyone outside `/students`) and adds or ends roles from Google Group membership through `role_group_mappings`. Manual role assignments are never touched; staff added by hand (never seen by the sync) are never deactivated by it. Every change is audited by the "Google Directory sync" system user.

## Hosting details

- Nightly jobs (Directory sync) run as **Cloud Run jobs started by Cloud Scheduler**, not on a pg-boss worker. pg-boss stays in the stack for queued work from the app (imports, slips, refreshes) when those modules arrive.
- One Docker build makes two images: `app` (Next.js standalone server) and `tools` (full source, for `pnpm db:migrate`, `pnpm directory:sync`, the AI CLI).
- Cloud SQL has a **private IP only**; Cloud Run reaches it through direct VPC egress. TLS is required.
- The app and migrations use Cloud SQL built-in users (`creo_app`, `creo`). Built-in users are members of `cloudsqlsuperuser`; table privileges and the audit-log revokes still apply because the app role owns no tables, but moving the app to IAM database authentication would tighten this.
- Deploys use **Workload Identity Federation** from GitHub Actions (no service account keys), restricted to the `bensk/creo` repository.

## Safety rails added with this

Reset and seed now check the **database name**, not just the host: a Cloud SQL proxy makes production look like `localhost`. Only `creo_dev`, `*_test`, and `*_staging` (with `SEED_STAGING_CONFIRM` set to the name) can be wiped; production's database is `creo` and is always refused.
