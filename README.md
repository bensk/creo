# Creo SIS

The student information system for Creo College Prep, a public charter middle school (grades 5–8) in Mott Haven, South Bronx.

We are building our own SIS so student data lives in one place, staff stop building a new Google Sheet for every trip and intervention group, and leaders can see what's happening without exporting anything. It runs alongside Schoolrunner and replaces it one module at a time: attendance, behavior, family communication, and eventually the gradebook. A module becomes the system of record only after it passes its cutover criteria in a parallel run.

The build team is Ben and Claude Code.

## What matters, in order

1. **Correct and private.** This is student data, covered by FERPA and NY Ed Law 2-d. Getting it right and keeping it locked down comes before any feature.
2. **Fast.** Finding a student, taking attendance, logging behavior, editing a cell should all feel instant.
3. **Flexible without code.** Staff add fields, build trackers and lists, and (soon) build dashboards themselves.
4. **Modular.** A new domain ships as its own module without touching unrelated code.
5. **Keyboard-first.** Every screen works without a mouse. Press `?` anywhere to see the keys.

## Where things stand (November 2026)

| Phase | What | Status |
|---|---|---|
| 0 | Foundation: sessions, permissions, audit log, app shell, keyboard layer, AI grants | Done in code. Google sign-in and the Google Cloud infrastructure are written and tested but not yet switched on. |
| 1 | Students, contacts, profiles, the student grid, imports, Slack lookups | Done, except the Schoolrunner behavior history import (waiting on the export format) |
| 2 | Groups, lists, trackers | Mostly done. Rule columns, Google Sheets export, and live updates between editors are next. |
| 3 | Daily homeroom attendance, the school calendar, late desk, Schoolrunner reconciliation | Done. Parallel run starts when we go live. |
| 4 | Behavior, restorative practices, family communication | Not started |
| 5 | Family portal, weekly slips, student portal | Not started |
| 6 | Dashboards | Not started |
| 7 | Gradebook and assessments | Not started |
| 8 | State reporting, retiring Schoolrunner | Not started |

No real student data is in the system yet. Before any goes in, the privacy checklist in [`docs/PLAN.md`](docs/PLAN.md#hosting-and-privacy) has to be complete: Ed Law 2-d plan, vendor data agreements, the access matrix signed off, a tested backup restore.

The full plan, data model, and phase checklists are in [`docs/PLAN.md`](docs/PLAN.md). Decisions that would surprise someone later are written up in [`docs/decisions/`](docs/decisions/).

## What's in it today

- **Find any student fast.** `⌘K` finds any student and jumps to any page or action. Every name shows the student's preferred name, with a phonetic spelling and a recorded pronunciation where we have one.
- **Student profile.** Groups (with history), contacts, enrollment, supports, health, demographics, and a timeline of absences, tardies, and behavior. Each section is shown or hidden by the viewer's role and logged when it's sensitive.
- **The student grid.** A spreadsheet-like view of every student: sort, filter, pick columns, save views, edit inline, bulk edit. Custom fields that admins add show up here with no migration.
- **Groups, lists, and trackers.** A tracker starts from a group of students (a grade, a homeroom, a list, a filter), live or fixed, then gets its own columns. Some you fill in, some are computed ("attendance rate since Sept 1"). Share it with people or Google Groups. It replaces the trip eligibility sheet, the intervention sheet, and the rest of them.
- **Attendance.** Homeroom teachers take attendance by keyboard (`p` / `a` / `t` / `e`) or touch. There's a late desk for tardies with arrival times, a calendar ops maintain, missing-attendance views, chronic absence flags, and a reconciliation report against Schoolrunner's daily export.
- **Imports.** The Big Data Tracker (Notion), Schoolrunner's Clever roster files, and Schoolrunner's daily attendance export. All of them are safe to re-run, and none of them overwrites anything staff entered in the SIS.
- **Slack.** `/student` lookups (only you see the answer), link previews that show only a title, and notifications routed by rules admins set in the app. The first one is a 9:30 DM to homeroom teachers who haven't finished attendance.
- **English and Spanish** in the student and family portals from day one.

## How it's built

Next.js (App Router, server components, server actions), TypeScript, PostgreSQL with Drizzle, Tailwind with the Creo design tokens, Glide Data Grid, Zod at every boundary, Vitest and Playwright. Hosted on Google Cloud Run and Cloud SQL in Creo's own Google Cloud project ([ADR 0002](docs/decisions/0002-google-sign-in-and-hosting.md)).

A few ideas hold the whole thing together:

- **One query language.** Grid filters, saved views, lists, tracker columns, eligibility rules, and dashboard widgets all use the same JSON query spec, compiled to SQL in `src/core/query`. The compiler decides what each viewer can see. Nobody, including the AI, writes SQL.
- **Default deny, enforced in one place.** Every page and server action checks the viewer. The role and sensitivity matrix lives in one file, `src/core/permissions/matrix.ts`. All staff can see every student; sensitive fields (IEP, 504, ELL, health, discipline narratives) depend on role and assignment.
- **Everything is audited.** Every write goes into an append-only audit log in the same transaction. The app's database role can't change or delete audit rows. Reads of sensitive fields are logged too.
- **History is never overwritten.** Homerooms, grades, groups, and enrollment are dated rows, so "who was in Syracuse on October 3" always has an answer.
- **Modules plug in.** Each module in `src/modules/` has a manifest declaring its tables, permissions, nav, shortcuts, query sources, and profile panels. Modules talk to each other through those, not through each other's tables.
- **AI is optional and off by default.** Every feature works fully without it. When it's on, it only pre-fills forms people already use, never sees a field the person asking can't see, and never writes to the database. Grants are made from the command line, not the app.
- **Slack is a convenience, not a dependency.** Anything you can do in Slack you can do in the app. Nothing about a specific student goes into a channel unless an admin has approved that private channel for names, and sensitive fields never go to Slack at all.

```
src/
  app/          routes only: (staff), (student), (family), api
  core/         db, auth, permissions, audit, query engine, UI kit, keyboard layer
  modules/      students, cohorts, attendance, behavior, trackers, slack, integrations
docs/
  PLAN.md       the build plan
  decisions/    ADRs
  setup/        Google Cloud and Slack setup, step by step
infra/          Terraform and the Slack app manifest
tests/          e2e (Playwright), load (k6), production guards
```

## Running it locally

You need Node 22+, pnpm, and Docker.

```bash
pnpm install
```

```bash
cp .env.example .env.local
```

```bash
pnpm db:up
```

```bash
pnpm db:migrate
```

```bash
pnpm db:seed
```

```bash
pnpm dev
```

Then go to [localhost:3000/dev/sign-in](http://localhost:3000/dev/sign-in) and sign in as any seeded person: one for every staff role, plus students and families. You don't need Google, Slack, or an Anthropic key to run anything locally.

Everything in the local database is synthetic. Seeded OSIS numbers start with `999`, family emails are on `example.com`, and phone numbers are in the fictional `555-01xx` range. `pnpm db:seed` wipes and reloads the local database, and refuses to touch any other.

Dev sign-in exists only on your machine. Its routes aren't compiled into production builds, it refuses to run against a database that isn't local and seeded, and the server won't start if `DEV_SIGN_IN` is set in production. CI checks all three.

### Checks

Run these before calling anything done:

```bash
pnpm lint && pnpm typecheck && pnpm test
```

```bash
pnpm test:e2e
```

Tests run against a separate `creo_test` database, rebuilt from the migrations on every run, and connect as the same restricted database role the app uses in production.

### Other commands

| Command | What it does |
|---|---|
| `pnpm db:generate` | Generate a migration from schema changes |
| `pnpm directory:sync` | Sync staff and roles from Google Workspace and link student accounts (runs nightly in production) |
| `pnpm ai:grant` / `ai:revoke` / `ai:list` | Turn AI features on or off for a role or a person |
| `pnpm import:bdt` | Import the Big Data Tracker from Notion (production only) |
| `pnpm attendance:remind` | Send the attendance-not-taken Slack DMs |
| `pnpm load:sessions` | Mint sessions on a synthetic database for the k6 load test |
| `pnpm test:prod-guards` | After `pnpm build`, prove dev sign-in isn't in the production build |

## Deploying

Staging (synthetic data only) and production each live in their own Google Cloud project, built with Terraform and deployed from GitHub Actions on merge to `main`. The steps only a Creo admin can do are in [`docs/setup/google-cloud.md`](docs/setup/google-cloud.md) and [`docs/setup/slack.md`](docs/setup/slack.md).

## Working on it

[`CLAUDE.md`](CLAUDE.md) is the rulebook for anyone, human or Claude, writing code here. The short version:

- Say which phase and module a change belongs to.
- Make the smallest change that does the job.
- Schema changes, new modules, and promoting a tracker or custom field to a real column all get approved by Ben first, in plain language, before the migration is generated.
- Never commit real student data. `data/`, `*.csv`, and `*.xlsx` are ignored for a reason.
- Never log student PII. Log IDs.
- UI copy is plain and useful. It says "student," never "scholar."
- Write an ADR when a decision would surprise someone later.
