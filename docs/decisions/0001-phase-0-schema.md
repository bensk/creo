# 0001 — Phase 0 schema: identity, access, audit, and pulled-forward people tables

Status: accepted (approved by Ben, October 2026)

## Context

Phase 0 needs every role (staff, student, family) to sign in and be tested end to end, an audit log, and AI grants. The data model in `PLAN.md` had a `staff.role` column, separate `family_accounts` / `family_sessions`, and no single identity to act as the actor for audit and grants.

## Decision

- **One `users` table** for every sign-in identity (kind: staff / student / family / system). `staff`, `students`, and `contacts` each point to it through a unique `user_id`. The link runs from those tables to `users`, not the other way, so core tables never depend on module tables. A user's kind matching its linked row is enforced in code.
- **System users** (kind `system`, no email) act for imports and CLIs, so `created_by` is never null. The first system user is created by itself.
- **`schools`** has no `school_id` or `created_by`; it is created by setup. `audit_log` and `sensitive_reads` record `actor_user_id` and `at` instead of the standard columns; `sessions` are created by their own user.
- **Roles**: `staff_roles` (several per person, effective-dated, source directory or manual) and `role_group_mappings` (admin-editable). Directory sync never touches manual rows.
- **`group_staff`** links staff to groups (homeroom teacher, lead, member). All staff can see every student; this table only decides "my" views, teachers' access to sensitive fields of assigned students, and homeroom attendance rights.
- **Sessions**: one `sessions` table for all three portals (separate cookies), storing only a SHA-256 hash of the token. Family accounts are `users` rows; `family_accounts` and `family_sessions` are dropped.
- **Pulled forward from later phases, core columns only**: `school_years`, `students`, `contacts`, `student_contacts`, `enrollments`, `groups`, `group_memberships`.
- **Database-enforced rules**: effective-dated rows cannot overlap (exclusion constraints, `btree_gist`); contact emails can never be a `creoprep.org` address; OSIS is nine digits; AI grants target exactly one role or user.
- **Audit is append-only**: the app connects as `creo_app`, which has no UPDATE/DELETE/TRUNCATE on `audit_log` or `sensitive_reads`, and a trigger rejects those operations for every role, including the owner.
- **Value lists** (roles, kinds, statuses) are text columns with CHECK constraints rather than Postgres enums, so adding a value is a one-line migration.

## Open

- Whether two family contacts may share one email (a common household setup) is decided with family sign-in in Phase 5. For now only staff and student emails are unique on `users`.
- Cross-table `school_id` consistency (a membership's school matching its group's school) is enforced in code, not by the database. Revisit when a second school is real.
