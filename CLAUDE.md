# CLAUDE.md — Creo SIS

Instructions for Claude Code working in this repo. Read this file fully at the start of every session. The build plan, data model, and phase checklist live in `docs/PLAN.md`; read the section for the phase you are working in before writing code.

## What this is

A custom student information system for Creo College Prep, a public charter middle school (grades 5–8) in Mott Haven, South Bronx (DBN 84X612). It replaces Schoolrunner (attendance, behavior, family communication, gradebook) and the dozens of Google Sheets trackers staff build each year (trip eligibility, intervention lists, mastery trackers, retention lists).

The product goals, in priority order:

1. **Correct and private.** Student data is FERPA- and NY Ed Law 2-d-protected. Correctness and access control beat features.
2. **Fast.** Every common action (find a student, take attendance, log a behavior, edit a cell) should feel instant.
3. **Flexible without code.** Staff can add a field, spin up a tracker, build a list, or build a dashboard without a developer.
4. **Modular.** New domains ship as self-contained modules without touching unrelated code.
5. **Keyboard-first and delightful.** Every screen is fully usable without a mouse.

## Stack

- Next.js (App Router, React Server Components, Server Actions), TypeScript `strict` (pinned to 6.0.x until typescript-eslint supports 7)
- Tailwind CSS with Creo design tokens (see Design system below)
- PostgreSQL via Drizzle ORM; migrations with `drizzle-kit`
- Auth.js with Google provider, restricted to the `creoprep.org` Workspace domain
- Google Cloud APIs: Admin SDK Directory (staff, groups), Sheets, Calendar, Gmail (communication logging)
- Claude API (`@anthropic-ai/sdk`) for optional AI features; off by default, enabled from the backend by role or individual user; model set by `ANTHROPIC_MODEL` env var, never hardcoded. The app must build, run, and pass all tests with no `ANTHROPIC_API_KEY` set.
- next-intl for internationalization; every family-facing string ships in English and Spanish
- Email (Gmail API, sending as a school address) for family sign-in codes, slips, and notifications. Text messaging (SMS) is a later module; do not add an SMS provider, SDK, or phone-verification flow until that module is started
- Hosting: Google Cloud Run (app + worker) and Cloud SQL for PostgreSQL in Creo's Google Cloud project; see `docs/PLAN.md` → Hosting
- Slack: Bolt for JavaScript in HTTP mode, served from Next.js route handlers on the same Cloud Run service; long work handed to the pg-boss worker
- Zod for every boundary (forms, server actions, API routes, AI output, imports)
- Data grid: Glide Data Grid (canvas-rendered, handles thousands of rows, native keyboard editing)
- Charts: Recharts
- Background jobs: pg-boss (Postgres-backed queue; no extra infrastructure)
- Testing: Vitest (unit/integration against a real Postgres test DB), Playwright (e2e, including keyboard flows)
- Package manager: pnpm

## Commands

```
pnpm dev              # local dev server
pnpm db:up            # start local Postgres (docker compose)
pnpm db:migrate       # apply migrations (as the owner, MIGRATION_DATABASE_URL; the app connects as creo_app)
pnpm db:generate      # generate a migration from schema changes
pnpm db:seed          # wipe the LOCAL dev database and load synthetic data (never real students); refuses any non-local database
pnpm test             # vitest
pnpm test:e2e         # playwright
pnpm lint && pnpm typecheck
```

Run `pnpm lint && pnpm typecheck && pnpm test` before declaring any task done.

## Repo layout

```
src/
  app/                    # routes only; thin — compose module UI
    (staff)/              # staff app, Google sign-in
    (family)/             # family portal, separate auth, mobile-first
    (student)/            # student portal, Google sign-in
  core/                   # shared kernel: db client, auth, permissions, audit, query engine, ui kit
    db/
    auth/
    permissions/
    audit/
    query/                # the query spec → SQL compiler (see "One query language")
    ui/                   # design-system components, keyboard layer, command palette
  modules/
    students/
    cohorts/
    attendance/
    behavior/
    communication/
    gradebook/
    assessments/
    trackers/
    eligibility/
    dashboards/
    family/               # family portal, visibility settings, slips and progress reports
    student-portal/       # student questions, slip reflections, student visibility
    slack/                # Slack app: commands, shortcuts, modals, App Home, notifications, canvases
    integrations/         # google, schoolrunner import
    reporting/            # SIRS / state exports
docs/
  PLAN.md
  decisions/              # ADRs, one file per architectural decision
```

### Module contract

Every module exports a `manifest.ts`:

```ts
export const manifest = defineModule({
  id: "behavior",
  schema,                 // Drizzle tables owned by this module
  permissions,            // permission keys this module introduces
  nav,                    // sidebar entries
  commands,               // command palette entries + keyboard shortcuts
  sources,                // query-engine sources/metrics/dimensions this module exposes
  studentProfileTabs,     // panels it contributes to the student profile
});
```

Modules may import from `core/` and read other modules only through their exported `sources` or public `queries.ts`. No reaching into another module's tables directly. Adding a module = create the folder, register the manifest in `src/modules/index.ts`, generate a migration.

## Architectural rules

### One query language

Grid filters, saved views, dynamic lists, eligibility rules, and dashboard widgets all use the same JSON **query spec**, defined in `core/query/spec.ts` and compiled to SQL in `core/query/compile.ts`. Modules register sources, metrics, and dimensions in their manifest. Never write a second filtering system. Never let users or the AI submit raw SQL.

### Flexible data without migrations

- **Custom fields**: core entities (students, contacts, sections) have a `custom jsonb` column. Field definitions live in `custom_field_definitions` (type, options, required, permission level). Values are validated by a Zod schema generated from the definitions.
- **Trackers**: named, shareable, user-defined tables (e.g. "DC Trip 2027", "Tier 2 Math Intervention"). Creating one always starts from a **population**: all students, a grade, a homeroom or other group, a saved list, or any query-spec filter (e.g. students with a given accommodation). The population is either **live** (membership follows the source, rows are added and archived automatically) or **snapshot** (fixed at creation, members added manually). The creator then names the tracker, adds fields (manual or computed from the query spec, e.g. "attendance rate since Sept 1"), and shares it with people or Google Groups as viewer or editor. Definitions in `trackers` + `tracker_fields`; rows in `tracker_rows` with `data jsonb`, keyed to a student.
- **Tracker sensitivity**: a tracker inherits the highest sensitivity of its population filter and its fields. A tracker built from "students with an IEP" discloses IEP status to anyone who can see it, so it can only be shared with people whose role already grants that sensitivity. The share dialog enforces this and says why.
- **Promotion**: when a tracker or custom field becomes permanent and heavily queried, promote it to a real column or module via migration. Write an ADR when you do.

### History is never overwritten

Memberships (homeroom, grade, section, group, enrollment status) are effective-dated rows (`starts_on`, `ends_on`), not mutable columns. "Who was in Syracuse homeroom on Oct 3" must always be answerable.

### Permissions and privacy

- Every server action and query goes through `core/permissions`. Default deny.
- Staff roles: `admin`, `leader`, `ops`, `teacher`, `support` (SPED/ELL/counseling), `coach`. A person can hold several roles; their permissions are the union. Roles come from Google Groups through a group-to-role mapping stored as data (editable by admins); an admin can also assign a role manually, and Directory sync never overwrites a manual assignment.
- All staff can see every student in the school. A teacher's assignments (homeroom, grade team, sections) decide what is shown first — "my classes," "my homeroom," their gradebooks, attendance, and behavior — not what is allowed. Sensitive fields are still gated by sensitivity level.
- Every sign-in resolves to one `users` row (kind: staff / student / family) linked to `staff`, `students`, or `contacts`; that row is the actor for sessions, audit, AI grants, and shares. Imports and CLIs act as named system users, so `created_by` is never null.
- `student` role (Google sign-in with student Workspace accounts; a student account is one in the `/students` OU or its graduation-year sub-OUs, determined from the Directory, never from the email address): sees only their own records that are explicitly published to students, can ask their teachers questions, and can reflect on their weekly slip (see Student portal).
- `family` role: separate auth (see Family portal). Families see only their own children and only what is published to families.
- Sensitive fields (IEP/504 status, ELL status, health, discipline narratives, family situation notes) carry a `sensitivity` level and are hidden unless the role grants it. This applies to grids, exports, dashboards, and AI prompts.
- Every write is recorded in `audit_log` (who, what, before, after, when), in the same transaction as the write. Reads of sensitive fields and all exports are logged too. The audit log is append-only (the app's database role cannot update or delete it), kept forever, and readable only by `admin` and `leader`, with values redacted to the reader's sensitivity level.
- Sessions are stored in the database and revocable: staff 7 days rolling, families 30 days per device, students until the end of the school day. Every page and server action calls `requireViewer(surface)` from `core/auth/server.ts`; `src/proxy.ts` only redirects requests with no cookie and is never the access check. Every sign-in method ends in `createSession`, so permissions and auditing don't depend on how someone signed in.
- Dev sign-in (pick a seeded user) exists for local development only. It is compiled out of production builds, refuses to run unless the environment and database are local and seeded, and the app refuses to start if it is configured in production. Never weaken these guards; staging uses real Google sign-in.
- Never log student PII to the console, error tracker, or analytics. Log IDs only.
- Seed and test data are synthetic. Never commit real student data, OSIS numbers, or exports. `.gitignore` covers `data/`, `*.csv`, `*.xlsx`. Seed OSIS numbers start with `999`, family emails use `example.com/.net/.org`, and phone numbers use the fictional `555-01xx` range. Each module seeds its own tables from a `seed.ts` registered in `src/core/seed/build.ts`; fixed test users (one per role) live in `src/core/seed/personas.ts`.

### AI features (Claude API) — optional

- Every feature works fully without AI. AI is an accelerator layered on top of a manual path that already exists: the tracker builder, widget builder, and list builder are complete UIs on their own, and AI only pre-fills them.
- AI is off by default and can only be turned on from the backend. Grants can target a role (e.g. `leader`, `ops`) or an individual user, and a user has AI if either applies; an individual revoke overrides a role grant. Grants live in the `ai_grants` table, written only by the CLI (`pnpm ai:grant --role leader`, `pnpm ai:grant --user <email>`, `pnpm ai:revoke ...`, `pnpm ai:list`) run by Ben against the production database. There is no admin UI and no self-serve request. Grants can optionally be scoped to specific AI features (e.g. `trackers.suggest`, `dashboards.widget`, `family.draft`). A global kill switch (`AI_ENABLED=false`) overrides all grants. When AI is unavailable for a user, AI entry points are not rendered at all — no disabled buttons, no upsell. The `student` and `family` roles cannot receive grants unless that rule is deliberately changed in code.
- Build AI features in `src/modules/<module>/ai/` behind `core/ai/isEnabledFor(user)`. Never import `core/ai` from a non-AI code path.
- All Claude calls go through `core/ai/client.ts`. Creo's K-12 Claude agreement covers student data, so prompts may include any field — but only fields the requesting user is already permitted to see. The AI never widens access. The client logs prompt metadata (user, feature, entities referenced, token counts) without content.
- AI output that changes data (a tracker schema, a dashboard widget, a list definition) must be returned as structured JSON via tool use, validated against the Zod schema, and shown to the user as a preview they confirm. AI never writes to the database directly.
- AI-drafted family communication: plain language, no emoji, never sent automatically.

### Slack integration

Slack is Creo's operating system, so the SIS meets staff there. Slack is a convenience layer: every action available in Slack is also available in the app, and the SIS works fully with Slack disconnected.

- **Endpoints:** `/api/slack/commands`, `/api/slack/interactions`, `/api/slack/events`, `/api/slack/options`. Verify the Slack signing secret on every request. Acknowledge within 3 seconds; anything slower (queries over large data, image rendering, canvas updates) goes to pg-boss and responds via `response_url` or the Web API.
- **Identity:** Slack users are linked to staff by verified Workspace email (`slack_user_links`). Unlinked users get a polite ephemeral message and nothing else. Every Slack action runs through `core/permissions` as that staff member, exactly as in the app, and is written to `audit_log` with `via: slack`.
- **Notifications are data, not code.** Each module declares notification types in its manifest (`notifications: [...]`). Which channel or DM receives them, on what schedule, and at what detail level lives in `slack_rules`, editable by `admin` and `leader` in the staff app. Use the module's notification type; never call `chat.postMessage` directly from module code — go through `modules/slack/notify.ts`.
- **Privacy rules (enforced in `modules/slack/notify.ts` and the Block Kit builders, not left to callers):**
  - Anything about a specific student shown to one person (lookups, student cards, AI answers, confirmations) is **ephemeral** or in a DM or modal, never a channel post.
  - Channel posts have a detail level: `counts` (default), `initials`, or `names`. `names` is allowed only for **private** channels that an admin has allowlisted in `slack_rules`.
  - Fields with any sensitivity level above `standard` (IEP/504, ELL, health, discipline narratives, safety flags, family situation notes, OSIS) are never sent to Slack in any form, regardless of settings. Safety-flag notifications say only that something needs attention, with a link.
  - Link unfurls for SIS URLs show the object type and title only (e.g. "Tracker · DC Trip 2027 · 96 students"), never student rows.
  - Every message the SIS sends is logged in `slack_messages` (channel, type, detail level, ts) so it can be audited and, if needed, deleted.
- **Copy:** plain and short. Every message includes a direct link to the record in the SIS.
- **Workflow Builder steps** are thin wrappers over existing server actions; no logic lives only in Slack.

### Student portal

- Lives in `src/app/(student)`. Simple, readable on a school laptop or phone, English and Spanish.
- Default deny, same as families: students see only what `student_visibility` publishes (e.g. their attendance, their behavior this week, their slips).
- **My name.** If enabled in `student_settings` (`pronunciation.enabled`), students can record or update how their name is pronounced and how it's spelled phonetically, and set their preferred name for staff review.
- **Ask a teacher.** A student can send a question to a staff member who currently teaches them (section staff, homeroom, grade team). Rules:
  - No student-to-student messaging, ever.
  - Every thread is visible to school leaders and support staff; nothing between a student and an adult is private. The student UI says so plainly.
  - Staff reply inside the app, not by personal email or phone. Replies are logged.
  - Optional quiet hours (settings) when students can write but staff are not notified until morning.
  - Each question has a status (open → answered → closed) and shows up in the teacher's inbox and a leader view of unanswered questions.
  - Any message containing language suggesting a student may be unsafe is flagged to the counselor/social worker queue immediately, in addition to the teacher. This is a routing flag for a human, not an automated judgment, and it works without AI.
- **Slip reflection.** When a weekly slip is published, the student gets a short reflection form (prompts are part of the slip template, bilingual). Responses are visible to the student's homeroom teacher and grade team; whether they also appear on the family's copy of the slip is a template setting.
- **Settings.** `student_settings` toggles each feature (`questions.enabled`, `reflections.enabled`) at school level with per-grade overrides, editable by `admin` and `leader` in the staff app. When a feature is off, its UI and notifications disappear for students; existing threads and reflections stay readable to staff.

### Family portal

- Lives in `src/app/(family)` with its own layout, its own auth, and no access to staff routes. Mobile-first: most families will open it on a phone, from an email link or a printed slip's QR code.
- Sign-in: one-time code by email to a contact on file (text-message codes arrive with the SMS module) (`student_contacts` with `portal_access = true`). No passwords. A portal contact's email can never be a `creoprep.org` address: staff who are Creo parents sign in to the family portal with a personal email, as a separate identity. Sessions last 30 days per device.
- **Default deny.** Families see nothing about a student unless it is published through `family_visibility` settings (per field, per module, per grade). Sensitive fields can never be published to families except through a report template a leader approves.
- **Bilingual.** English and Spanish at launch; the language list is data so more can be added. The family's language comes from the contact's `language` field and can be switched on every page. All UI strings and all template text exist in every enabled language; a template cannot be published with a missing translation. Staff-written free text (behavior narratives, teacher comments) is shown as written, and the slip builder flags free-text fields so staff know to write them in the family's language or both.
- **Slips and progress reports** are built from templates: blocks (attendance summary, behavior points and notes, grades, assignments missing, tracker fields, a teacher comment, a static message) assembled in a template builder, previewed per student in both languages, then delivered by email, portal, or printed PDF (with a QR code to the portal). Delivery channels are pluggable (`deliveryChannels` in the family module) so the SMS module can add text delivery without changing slip code. Every delivery is logged to the communication log.
- Family-facing copy: plain, warm, short, no emoji, no jargon or internal codes (no "IA," no behavior point codes without labels).
- Visual design is held to a higher bar than the staff app: the Creo design system, generous spacing, large touch targets, readable at 320 px wide, WCAG AA contrast.

### Performance budgets

- Load target: 500 concurrent signed-in users (students and staff) with bursts — everyone opening the app at homeroom start, or a whole grade submitting at once — plus family traffic spikes after slips go out. p95 server action under 200 ms at that load. A k6 load test in CI covers the burst scenarios.
- Writes are small and targeted (one cell, one record). Never rewrite a whole tracker row or JSONB blob to change one field; use `jsonb_set` and optimistic concurrency (`version` column) so two people editing the same tracker don't overwrite each other.
- Collaborative screens (trackers, grids, dashboards) show other people's edits live via Server-Sent Events fed by Postgres LISTEN/NOTIFY.
- Route navigation: under 300 ms to interactive on school Wi-Fi.
- Grid: 1,000 rows × 60 columns scrolls at 60 fps; cell edits commit optimistically and reconcile.
- Attendance for a homeroom of 30: under 30 seconds with keyboard only.
- Use server components for reads, server actions with `useOptimistic` for writes, Postgres indexes for every foreign key and every filterable column. Use materialized views for heavy dashboard aggregates; refresh via pg-boss.

## Design system

Apply the Creo College Prep design system (tokens, typography, voice): https://claude.ai/code/artifact/8fe2e309-f268-4777-a5b4-cb78925f5ffb

- Fonts: Inter for text; Maple Mono for numbers, IDs, dates, scores, and anything tabular.
- Brand: primary `#ffb12a` (orange), `#434350` (charcoal), `#007bff` (blue). Expanded palette: coral pink, emerald green, soft purple, teal, dark navy, light gray. Define these as Tailwind v4 theme tokens in the `@theme` block of `src/app/globals.css`; never hardcode hex values in components.
- Support light and dark mode.
- UI copy is plain and useful. No cute or clever microcopy, no metaphors, no editorial voice.

## Keyboard layer

Implemented once in `core/ui/keyboard`. Every new screen must register its shortcuts there so they appear in the `?` help sheet.

| Keys | Action |
|---|---|
| `⌘K` / `Ctrl K` | Command palette (search students, staff, lists, trackers, dashboards, actions) |
| `/` | Focus search/filter on current screen |
| `g` then `s` / `a` / `b` / `c` / `t` / `d` / `l` | Go to Students / Attendance / Behavior / Communication / Trackers / Dashboards / Lists |
| `j` / `k` | Next / previous row or item |
| `Enter` | Open selected; in grid, edit cell |
| `Esc` | Close, cancel, clear selection |
| `n` | New item in current context |
| `?` | Shortcut help sheet |
| On a student profile: `b` | Log behavior |
| On a student profile: `m` | Log family communication |
| Attendance: `p` / `a` / `t` / `e` | Present / Absent / Tardy / Excused, auto-advance to next student |

Focus states are always visible. Test keyboard flows in Playwright.

## Language and domain conventions

- Attendance is daily homeroom attendance only. Period attendance is a possible future module; do not add period columns or tables now.

- Always "student," never "scholar," in code, UI copy, and docs.
- **Names matter.** Show a student's preferred name everywhere a name appears (legal name only where legally required: state exports, official records). Every student has an optional pronunciation: a phonetic spelling and a short audio clip. Wherever staff are likely to say a name out loud — attendance taking, rosters, the student profile header, the `⌘K` student result, substitute views — show the phonetic spelling and a play button next to the name. Use the `<StudentName>` component for this; never render a student name as plain text.
- Grades 5–8. Homerooms are named after colleges (e.g. Bloomfield, Macaulay, NCA&T, Syracuse); treat homeroom names as data, not constants.
- OSIS is the NYC student ID; it is a sensitive identifier and must be unique per student. The internal primary key is a UUID.
- "IA" = interim assessment. IAs are analyzed by topic and subtopic mastery per homeroom, with question-level and distractor analysis as secondary views.
- Behavior taxonomy, restorative actions, and schoolwide skills (perseverance, respect, integrity, self-control, empathy) are configurable data, seeded, not hardcoded.
- Dates are stored as `date` (school days) or `timestamptz` (events). School timezone is `America/New_York`.

## State reporting exports

CSV exports for NYSED SIRS (via ESBOCES / Charter Data Central) must:
- contain no template header rows unless the template requires them,
- be UTF-8 without BOM,
- have no trailing empty rows,
- put each value in its exact required field position.
Every export has a golden-file test.

## Working agreements for Claude Code

- The build team is Ben and Claude Code. Prefer managed services and boring, well-documented libraries over anything that needs a person on call.
- Ben approves every schema change, new module, and promotion of a tracker or custom field to a real column. Summarize the proposed migration in plain language and wait for approval before generating it. (Later this becomes the `schema.approve` permission for a small team.)
- Before starting a task, state which phase and module it belongs to (see `docs/PLAN.md`).
- Make the smallest change that completes the task. Do not refactor unrelated code.
- Schema changes: edit the module's `schema.ts`, run `pnpm db:generate`, review the SQL, commit migration and schema together. Use the helpers in `core/db/columns.ts` and `core/db/base.ts`; `src/core/db/schema-rules.test.ts` fails if a table lacks `school_id`, `created_by`, or an index on a foreign key. Rules drizzle-kit can't express (no-overlap constraints, triggers, grants) go in a `pnpm db:generate --custom` migration.
- Write an ADR in `docs/decisions/` for any decision that would surprise a future reader.
- If a requirement is ambiguous and the choice affects data shape or permissions, stop and ask. For UI details, pick the simplest reasonable option and note it.
- Update the phase checklist in `docs/PLAN.md` when a task completes.
