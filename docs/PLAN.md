# Creo SIS — Build Plan

Owner: Ben Samuels-Kalow · Started: October 2026 · Status: Phase 0

## Summary

We are building our own SIS so that student data lives in one place, staff stop creating one-off Google Sheets, and leaders can build live dashboards without exporting anything.

Strategy: **run alongside Schoolrunner, then replace it module by module.** Phase 1 imports Schoolrunner and the Big Data Tracker nightly, so the system is useful (search, profiles, grid, dashboards) before it is the system of record for anything. Each module becomes the system of record only when it passes its cutover criteria. Target: system of record for attendance, behavior, and family slips by the start of the 2027–28 school year; gradebook after a full-semester pilot.

## Who uses it and for what

| Role | Most frequent jobs |
|---|---|
| Teacher | Take attendance, log behavior, enter grades, check a student's week, log a family call |
| Grade team lead | Team lists, intervention groups, trip eligibility, team behavior trends |
| Leader (Ben, AP, deans) | Dashboards, students of concern, restorative follow-ups, retention decisions, coaching data |
| Ops (Delsy, Kiara) | Enrollment, rosters, homeroom assignments, contacts, state reporting exports |
| Support (SPED/ELL/counseling) | Service lists, accommodations, sensitive notes with restricted access |
| Student | Sign in with their Creo Google account; see what is published to them, ask their teachers questions, reflect on their weekly slip |
| Family | Sign in by email code (text later); see their children's attendance, behavior, grades, and slips in English or Spanish |

## Data model

Effective-dated memberships throughout (`starts_on`, `ends_on` = last day included, null = ongoing; overlaps rejected by the database). All tables have `id uuid`, `school_id`, `created_at`, `updated_at`, `created_by` → `users` (exceptions: `schools` has no `school_id`/`created_by`; `audit_log`, `sensitive_reads`, and `sessions` record their actor instead). See `docs/decisions/0001-phase-0-schema.md`.

**Calendar and structure**
- `school_years` (label, starts_on, ends_on)
- `terms` (school_year_id, type: trimester/quarter/marking_period, dates)
- `school_days` (date, is_instructional, day_type) — imported from Google Calendar; denominator for attendance rates
- `bell_schedules`, `periods`

**Identity and access**
- `schools` (name, dbn, timezone)
- `users` (kind: staff / student / family / system, email, display_name, status, last_sign_in_at) — one row per sign-in identity; `staff`, `students`, and `contacts` point to it via `user_id`
- `staff_roles` (staff_id, role, source: directory / manual, source_group_email, starts_on, ends_on) — several roles per person
- `role_group_mappings` (google_group_email, role) — admin-editable
- `sessions` (user_id, surface: staff / student / family, method: google / email_code / dev, token_hash, expires_at, last_seen_at, revoked_at) — replaces `family_sessions`

**People**
- `students` (user_id, legal + preferred name, pronouns, DOB, osis [unique, restricted], google_email [unique], photo_object_key, version [optimistic concurrency], `custom jsonb`)
- `name_pronunciations` (student_id, phonetic, audio_object_key, language, recorded_by_kind: staff / student / family; created_by = who) — newest is current, history kept
- `staff` (user_id, google_user_id, email, given/family/preferred name, title, status, org_unit_path, directory_synced_at, `custom jsonb`) — synced from Workspace Directory; roles in `staff_roles`
- `contacts` (user_id, name, phone(s), email [never a creoprep.org address], language, preferred channel)
- `student_contacts` (relationship, is_guardian, lives_with, pickup_allowed, contact_priority, portal_access, starts_on, ends_on)
- `student_supports` (type: iep / 504 / ell / other, details, accommodations[], starts_on, ends_on, source) — every column sensitive; no overlapping periods per type

**Enrollment and cohorts**
- `enrollments` (student_id, school_year_id, grade_level, status, entry/exit dates and codes) — periods may not overlap per student
- `groups` (type: homeroom / grade_team / advisory / intervention / club / team / custom, name, school_year_id, grade_level, owner, google_group_email, archived_at)
- `group_memberships` (group_id, student_id, starts_on, ends_on)
- `group_staff` (group_id, staff_id, function: homeroom_teacher / lead / member, starts_on, ends_on) — drives "my" views, teachers' sensitive access for assigned students, and homeroom attendance rights
- `courses`, `sections`, `section_staff`, `section_enrollments`

**Attendance**
- `attendance_codes` (code, label, counts_as: present/absent/tardy/excused, sirs_code, position, archived_at)
- `attendance_daily` (student_id, date [unique per student], code_id, note, source: sis / import; created_by = who recorded it) — basic tables shipped in Phase 1 for imported history
- Period attendance: not planned; possible future module

**Behavior and restorative practices**
- `behavior_types` (label, valence: positive/negative, points, skill, requires_followup, position, archived_at)
- `behavior_events` (student_id, type_id, occurred_at, location, staff_id, points [snapshot], narrative [confidential], source: sis / import) — basic tables shipped in Phase 1 for imported history; section_id arrives with sections
- `restorative_actions` (event_id or student_id, type: conversation / repair / family meeting / In-School Solutions / reset, status: requested → scheduled → completed, assigned_to, due_on, outcome)
- `consequences` (event_id, type, dates)

**Communication**
- `comm_logs` (channel: call/text/email/in-person/Schoolrunner, direction, occurred_at, staff_id, contact_id, summary, outcome, gmail_message_id)
- `comm_log_students` (comm_log_id, student_id) — one call can cover siblings

**Gradebook and assessments**
- `grading_scales`, `grade_categories` (per section, weights)
- `assignments` (section_id, category_id, title, due_on, points, standards[])
- `scores` (assignment_id, student_id, value, status: missing/excused/late)
- `standards` (code, description, subject, grade) — NYS standards
- `assessments` (IA metadata: subject, grade, window), `assessment_items` (number, topic, subtopic, standard, answer key, choices), `item_responses` (student_id, item_id, response, correct)

**Flexibility layer**
- `custom_field_definitions` (entity: students / contacts, key, label, type, options, required, sensitivity, help_text, position, archived_at)
- `trackers` (name, description, owner, school_year_id, population_kind: live/snapshot, population_source: all/grade/group/list/spec, population_spec jsonb, sensitivity, archived)
- `tracker_shares` (tracker_id, user_id or google_group, access: view/edit)
- `tracker_templates` (name, fields, default population) — "save as template" so next year's trip tracker is two clicks
- `tracker_fields` (tracker_id, key, label, type, options, computed_spec jsonb nullable, order)
- `tracker_rows` (tracker_id, student_id nullable, data jsonb)
- `lists` (name, kind: static/dynamic, spec jsonb for dynamic, members for static)
- `saved_views` (owner_user_id, name, source, spec jsonb [filters + sort], columns[], sharing: private / school, position)
- `rules` (name, spec jsonb, applies_to: list/tracker) — eligibility logic

**Family portal and reports**
- Family accounts are `users` rows (kind: family) linked from `contacts.user_id`; `student_contacts.portal_access` controls who gets one. Sessions live in `sessions`.
- `family_sign_in_codes`
- `family_visibility` (scope: school / grade / student, module or field key, visible, approved_by)
- `report_templates` (name, kind: weekly slip / progress report / custom, audience grade(s), blocks jsonb, reflection_prompts jsonb, show_reflection_to_family, languages, status: draft/approved, approved_by)
- `report_runs` (template_id, period, population spec, generated_at, generated_by)
- `report_deliveries` (run_id, student_id, contact_id, channel: email/portal/print (sms added by the SMS module), language, sent_at, opened_at)
- `ui_translations` (key, language, text) — template and custom-field labels; app strings live in next-intl message files

**Student portal**
- `student_visibility` (scope: school / grade, module or field key, visible)
- `student_settings` (scope: school / grade, key: questions.enabled / reflections.enabled / quiet_hours, value)
- `question_threads` (student_id, staff_id, section_id nullable, subject, status: open/answered/closed, safety_flag, created_at)
- `question_messages` (thread_id, author: student or staff_id, body, created_at, read_at)
- `slip_reflections` (report_delivery_id or run_id, student_id, responses jsonb, language, submitted_at)

**Imports**
- `import_runs` (source, kind, started_at, finished_at, status, counts, error_summary [no student details])
- `external_ids` (entity, entity_id, source, external_id) — unique per source and entity; makes imports safe to re-run

**Slack**
- `slack_installation` (team_id, bot token ref in Secret Manager, installed_by, scopes)
- `slack_user_links` (staff_id, slack_user_id, linked_at)
- `slack_rules` (notification_type, target: channel_id / dm_role / dm_owner, schedule, detail_level: counts/initials/names, enabled, created_by)
- `slack_channel_allowlist` (channel_id, is_private, allow_names, approved_by)
- `slack_canvases` (purpose, canvas_id, source spec, last_synced_at)
- `slack_messages` (channel_id, ts, notification_type, detail_level, sent_at)

**Dashboards**
- `dashboards` (name, owner, sharing, layout jsonb)
- `widgets` (dashboard_id, type: number/table/bar/line/heatgrid/list/notes, spec jsonb, position)

**System**
- `ai_grants` (role or user_id, effect: grant/revoke, features[] nullable = all, note, ended_at, ended_by; created_by/created_at = who granted it and when) — written only by the `ai:grant` / `ai:revoke` CLI
- `audit_log` (actor_user_id, action, entity, entity_id, before jsonb, after jsonb, via, request_id, at) — append-only, kept forever
- `sensitive_reads` (actor_user_id, entity, entity_id, field, via, at) — append-only
- `jobs` (pg-boss managed)

## The query spec

One JSON shape powers filters, lists, rules, tracker computed fields, and dashboard widgets.

```json
{
  "source": "attendance_daily",
  "metrics": ["absence_rate"],
  "dimensions": ["homeroom"],
  "filters": [
    { "field": "grade_level", "op": "in", "value": [7, 8] },
    { "field": "date", "op": "between", "value": ["2026-09-08", "today"] }
  ],
  "sort": [{ "field": "absence_rate", "dir": "desc" }]
}
```

Modules register sources (`students`, `attendance_daily`, `behavior_events`, `scores`, `item_responses`, `tracker:<id>`), metrics (named SQL aggregates), and dimensions (homeroom, grade, section, week, behavior type, standard). The compiler enforces permissions and sensitivity before generating SQL. Claude's natural-language features produce this spec, not SQL.

## Worked example: trip eligibility without a spreadsheet

Creating a tracker is a three-step flow, reachable from `⌘K → New tracker`, from any group or list page ("Track these students"), or from a filtered grid ("Make a tracker from this view").

1. **Choose who.** All students, a grade, a homeroom or other group, a saved list, or a filter (e.g. "8th grade AND has accommodation: extended time"). A live count and preview of matching students updates as you choose. Pick **live** (8th graders who enroll later get added automatically) or **snapshot** (exactly these students).
2. **Name it and add columns.** Name: "DC Trip 2027." Add manual columns (permission slip: yes/no, deposit: currency, medical form: checkbox, notes: text) and computed columns from a menu (attendance rate since a date, behavior points in last N days, missing assignments, any student field or custom field). Or start from a template.
3. **Share it.** Add people or Google Groups (e.g. the 8th grade team) as viewers or editors. If the population or a column is sensitive, the dialog only allows people whose role already covers that sensitivity.

Then:
- Add a rule column: eligible if attendance ≥ 90%, behavior points under threshold, permission slip = yes. It updates live.
- The tracker grid works like a sheet (keyboard edits, filters, saved views) and has an "Export to Google Sheet" button for anyone who needs one, but the tracker remains the source of truth.
- "Save as template" keeps the columns and rules for next year.

If the user has AI enabled, step 2 also offers a text box ("describe the columns you need") that pre-fills the same column form for review. Nothing else about the flow changes.

The same pattern covers intervention groups, accommodation trackers for testing, mastery trackers, retention reviews, summer program lists, and high school application tracking.

The same pattern covers intervention groups, mastery trackers, retention reviews, summer program lists, and high school application tracking.

## Dashboards

- Built from widgets; each widget is a query spec plus a visualization type.
- Ways to create a widget: pick source/metric/dimension in the builder, or duplicate from a template. For users with AI enabled, a plain-language box ("absence rate by homeroom by week since September") pre-fills the builder for review.
- Templates to ship first, based on dashboards already built in Claude: IA mastery heat grid (topic × homeroom, subtopic drill-down, question grid with distractor analysis, student drill-down); attendance by homeroom by week; behavior positive-to-negative ratio by grade and staff; students of concern (cross-domain); restorative follow-ups open by owner; communication volume and parent complaint log.
- Notes widget: post-it notes attributed by author initials (pattern from the "Communications vs. discipline" dashboard).
- Live: widgets re-query on load and on an interval; heavy aggregates read materialized views refreshed by background jobs.
- Sharing respects permissions: a teacher viewing a shared dashboard sees only rows they are allowed to see.
- De-identified mode for sharing outside the leadership team (names replaced by initials or IDs).

## Integrations

| System | Purpose | Direction | Phase |
|---|---|---|---|
| Google OAuth | Sign-in, `hd=creoprep.org` restriction | in | 0 |
| Workspace Directory | Staff roster, Google Groups → roles | in, nightly | 0 |
| Big Data Tracker (Notion database) | Source of truth for OSIS, grade, homeroom during transition | in, nightly | 1 |
| Schoolrunner API (`creoprep.schoolrunner.org/api/v1/`) | Historical + live attendance, behavior, comm, grades during transition | in, nightly | 1 |
| Google Calendar | Instructional days, school events | in | 3 |
| Gmail | Attach family emails to comm logs (opt-in per staff) | in | 4 |
| Google Sheets | One-click export of any view/tracker | out | 2 |
| Slack | Commands, shortcuts, App Home, notifications, live canvases, dashboard snapshots (see Slack section) | both | 1–6 |
| SMS provider (e.g. Twilio) | Family sign-in codes, slip links, notifications — later module | out | later |
| Gmail API (school send-as address) | Slip and report emails to families | out | 5 |
| NYSED SIRS via ESBOCES | Level 0 exports (Student Class Entry/Exit, CIA, etc.) | out | 8 |

Import rules: imports are idempotent (upsert by external ID), record source and timestamp, and never overwrite a field the SIS has already taken over as system of record. Standalone CSV exports found in Slack are treated as stale; the Big Data Tracker wins for OSIS, grade, and homeroom until cutover.

## Slack

Slack is a second front door to the SIS, not a separate system. Everything below also works in the app.

**Slack → SIS (doing work without switching apps)**

| Feature | What it does | Phase |
|---|---|---|
| `/student <name>` | Private student card: attendance this week, behavior this week, contacts, link to profile | 1 |
| Link unfurls | SIS links preview with type and title only | 1 |
| "Log as family communication" message shortcut | Turns any Slack message into a comm log entry: pick student(s), contact, channel; message text prefilled | 4 |
| `/call` and `/behavior` | Modals to log a family contact or a behavior event in seconds | 4 |
| "Create restorative request" message shortcut | Opens the restorative request modal from a Slack message, prefilled | 4 |
| App Home "My day" | My homeroom's attendance status, my open restorative actions, unanswered student questions, trackers I edit | 4 |
| "Add to tracker" message shortcut | Adds a student or updates a tracker field from Slack | 4 |
| Workflow Builder steps | "Look up student," "Add row to tracker," "Log communication" for staff-built automations | 6 |
| Ask the SIS (AI-granted roles only) | "@SIS which 7th graders have 3+ absences this week?" answered privately via the query engine | 6 |

**SIS → Slack (the right information to the right place)**

| Notification | Default target | Default detail | Phase |
|---|---|---|---|
| Attendance not taken by 8:30 | DM to homeroom teacher | n/a (no student data) | 3 |
| Restorative request created / overdue | Restorative team private channel (allowlisted) | names | 4 |
| Live "Unaddressed Restorative Requests" canvas | Restorative team channel canvas, updated on every change | names | 4 |
| Friday grade team digest | `#team-5` … `#team-8` | counts | 4 |
| Student question unanswered for 24 hours | DM to teacher; daily summary to leaders | initials | 5 |
| Safety flag on a student message | DM to counselor/social worker | link only | 5 |
| Weekly slips ready to review / sent | Grade team channel | counts | 5 |
| Scheduled dashboard snapshot | Any channel; e.g. Monday attendance by homeroom to `#leadership-team` | rendered image of an aggregate widget + link | 6 |

Dashboard snapshots are rendered to PNG in the worker (headless Chromium via Playwright) and uploaded with Slack's external upload flow. Only aggregate widgets (no student-level rows) can be scheduled to channels.

**Later, if useful:** enrollment leads from `#track-enrollment` into an enrollment module; `#request-coverage` and Justworks time-off into a staff attendance and coverage module.

## Hosting and privacy

**Decision: Google Cloud in Creo's own Cloud project.**

- **App:** Cloud Run service running the Next.js container. Minimum 2 instances always warm (no cold starts at 7:55 a.m.), autoscaling to ~10, ~80 concurrent requests per instance.
- **Worker:** a second Cloud Run service (or Cloud Run job) running pg-boss workers for imports, materialized-view refreshes, slip generation, and email sends. Long-running work never runs inside a web request.
- **Database:** Cloud SQL for PostgreSQL, high-availability (automatic failover), 2–4 vCPU to start, point-in-time recovery, daily backups. Managed connection pooling (or PgBouncer) in front of it so app instances share a small pool of database connections.
- **Secrets:** Secret Manager. **Files** (PDF slips, photos, imports): Cloud Storage with uniform access and signed URLs.
- **Region:** us-east4 (Virginia), closest to the Bronx.
- **Environments:** `staging` (synthetic data only) and `production`. Deploys via GitHub Actions on merge to `main` after CI passes.

Why this over Vercel + managed Postgres for 400+ concurrent users doing heavy data entry:
- 400–500 concurrent users is modest load for either. The real risks are database connections and long-running work, and Cloud Run handles both more simply: a few warm, long-lived instances hold a small connection pool, where serverless functions each open their own connections and need extra pooling infrastructure.
- Background workers and live updates (Server-Sent Events for collaborative trackers) need long-lived processes. Cloud Run supports them directly; on Vercel they require extra services.
- Student and family data stays inside the Google relationship Creo already has, under Workspace admin control.
- Predictable monthly cost. Expect low hundreds of dollars a month for production at this size; price it in the Cloud console calculator before committing.
- Trade-off: slightly more setup than Vercel (Dockerfile, Cloud Build, IAM). Phase 0 includes doing this once with Terraform so it is repeatable — including for other schools later.

Multi-school later: build single-school now, but every table that holds school data carries a `school_id` from day one so the same codebase can serve other schools (one database per school or row-level security — decide when the second school is real).

Privacy checklist before any real student data is loaded:
- [ ] Confirm NY Ed Law 2-d obligations for Creo as an educational agency; data privacy and security plan on file
- [ ] Data processing terms in place with each vendor that touches PII (Google Cloud, Slack; SMS provider when that module starts)
- [ ] Slack retention settings match Creo's records policy; Slack app scopes reviewed
- [ ] Confirm Creo's K-12 Claude agreement covers Claude API usage from this app (not only the Claude apps), and use the API key issued under that agreement
- [ ] Parents' Bill of Rights for Data Privacy and Security reviewed and updated if needed
- [ ] Role and sensitivity matrix signed off by Ben and the AP
- [ ] Backup restore tested

## Phases

Each phase ends with a short demo to leadership and a written check against exit criteria.

### Phase 0 — Foundation
- [x] Repo, CI (lint, typecheck, test), docker compose Postgres
- [x] Synthetic seed generator (realistic names, grades 5–8, four homerooms per grade, contacts, a persona for every role; each module adds its own history, e.g. a year of attendance/behavior, when its schema lands)
- [x] Dev-only "sign in as a seeded user" for every role; compiled out of production builds, with CI proof
- [ ] Google sign-in with domain restriction; staff sync from Directory; roles from Google Groups — code and tests done; switches on with the OAuth client and Directory credentials (`docs/setup/google-cloud.md`)
- [x] Permission layer + audit log (rows marked PROPOSED in `src/core/permissions/matrix.ts` await sign-off of the access matrix)
- [x] `ai_grants` table (role and user grants, per-feature scope), `pnpm ai:grant` / `ai:revoke` / `ai:list` CLI, `AI_ENABLED` kill switch
- [ ] Google Cloud project, Terraform for Cloud Run (app + worker), Cloud SQL HA, Secret Manager, Storage; staging and production — Terraform, Dockerfile, and deploy workflow written and validated; not yet applied
- [x] `school_id` on every school-data table (enforced by `src/core/db/schema-rules.test.ts`)
- [ ] k6 load test: 500 concurrent users, homeroom-start burst — script and session minting done and run locally; run against staging once it exists
- [x] App shell: sidebar, command palette, keyboard layer, `?` help sheet, light/dark, Creo tokens; English/Spanish (next-intl) in the student and family portals
- [x] Module registry and `defineModule`
- Exit: a staff member signs in, sees their role-appropriate shell, and every shortcut in CLAUDE.md works.

### Phase 1 — Students, contacts, the grid
- [ ] Slack app: install, signing-secret verification, user linking by email, `/student` lookup, link unfurls, `slack_rules` admin screen
- [x] Students, enrollments, contacts, supports schema (plus pronunciations, custom field definitions, saved views, import runs, external IDs, Slack tables, and basic attendance and behavior tables)
- [ ] Importers: Big Data Tracker, Schoolrunner students/contacts/attendance/behavior history — Big Data Tracker (Notion) importer done and tested (ADR 0003), runs once the Notion token is stored; Schoolrunner waits for an API key
- [ ] Student database grid (Glide): sort, filter (query spec), column picker, saved views, inline edit with audit, bulk edit
- [ ] Student profile: header, groups, contacts, supports (restricted), timeline of attendance/behavior/comm — header, groups (with history), contacts, enrollment history, and restricted identifiers done; supports wait on the Phase 1 schema; the timeline fills in as attendance, behavior, and communication ship
- [ ] Custom fields on students (admin UI)
- [ ] Name pronunciation: phonetic spelling and staff-recorded audio on the profile; `<StudentName>` component with play button used in rosters, profile header, and `⌘K` results — phonetic spelling shown through `<StudentName>` in the profile header and ⌘K; recording audio comes with file storage
- Exit: leaders use search + profiles daily for two weeks; import diff against Schoolrunner shows zero unexplained mismatches.

### Phase 2 — Cohorts, lists, trackers
- [ ] Groups and effective-dated memberships; homeroom/team/section management UI
- [ ] Static and dynamic lists
- [ ] Query engine v1: sources, metrics, dimensions from students, attendance, behavior
- [ ] Tracker creation flow: choose population (all / grade / group / list / filter, live or snapshot) → name + columns → share
- [ ] "Track these students" entry points on group pages, list pages, and filtered grids
- [ ] Computed columns, rule columns, tracker grid, Google Sheets export
- [ ] Sharing with people and Google Groups; sensitivity inheritance enforced in the share dialog
- [ ] Tracker templates
- [ ] (AI, optional) "Describe the columns" box that pre-fills step 2
- Exit: the next trip eligibility list and one intervention tracker run in the SIS with no companion spreadsheet, built by a grade team lead without AI.

### Phase 3 — Attendance
- [ ] Attendance codes with SIRS mapping; school days from Google Calendar
- [ ] Homeroom attendance taking (keyboard and touch), late arrivals desk flow; pronunciation shown next to every name, with `space` to play the selected student's clip
- [ ] Attendance rates, chronic absence flags, daily missing-attendance report
- [ ] Parallel run: SIS and Schoolrunner both recorded; nightly reconciliation report
- [ ] Slack: attendance-not-taken DM
- Exit (cutover): four consecutive weeks of reconciliation with zero unexplained differences; ops sign-off.

### Phase 4 — Behavior, restorative practices, communication
- [ ] Behavior types and points (configurable), quick-log from profile, roster, and palette
- [ ] Restorative actions workflow with owners and due dates; open-requests view
- [ ] Slack: restorative channel notifications and live canvas (replaces the hand-maintained "Unaddressed Restorative Requests" canvas)
- [ ] Slack: "Log as family communication" and "Create restorative request" shortcuts, `/call`, `/behavior`, "Add to tracker", App Home "My day", Friday grade team digests
- [ ] Communication log; Gmail attach; family contact history on profile
- [ ] (AI, optional) Draft family message (no emoji), summarize a student's last two weeks for a leader
- Exit (cutover): parallel run for one marking period; restorative follow-up completion is visible weekly.

### Phase 5 — Family portal, weekly slips, progress reports
- [ ] Family auth: email one-time codes, device sessions, portal access per contact
- [ ] Family visibility settings (default deny) with preview: "see the portal as this student's family"
- [ ] Portal home per child: today's attendance, this week's behavior, recent slips; grades added when Phase 7 ships
- [ ] English/Spanish throughout; language switcher; translation completeness check blocks publishing
- [ ] Report template builder: blocks, per-grade audiences, bilingual text, approval step
- [ ] Weekly slip runs: generate for a population, review queue, send by email / portal, print-ready PDF batch with portal QR codes
- [ ] Delivery log on the communication timeline; open tracking
- [ ] Slack: unanswered-question DMs and leader summary, counselor safety-flag DM, slips-ready notifications
- [ ] Student portal: Google sign-in, student visibility settings, "see it as this student" preview
- [ ] Name pronunciation from students and families: record a clip and phonetic spelling in the student and family portals (each toggleable); staff notified when a pronunciation changes
- [ ] Slip reflections: bilingual prompts on the template, student form, teacher/grade-team view, optional display on the family copy
- [ ] Ask a teacher: threads to current teachers only, staff inbox, leader view of unanswered questions, quiet hours, safety flag routed to counselor queue
- [ ] Student settings: school-level toggles with per-grade overrides for questions and reflections
- [ ] Start-of-year prompt: families and students asked to record names during enrollment/onboarding, so every teacher has them before day one
- [ ] Usability test with at least five families, including Spanish-speaking families, on their own phones
- Exit (cutover from Schoolrunner family messaging): weekly slips go out from the SIS for four straight weeks; families and students can sign in without help; median time to answer a student question is under one school day.

### Phase 6 — Dashboards
- [ ] Dashboard + widget builder on the query spec
- [ ] (AI, optional) Plain-language box that pre-fills the widget builder
- [ ] Ship templates listed in the Dashboards section
- [ ] De-identified sharing mode
- [ ] Slack: scheduled dashboard snapshots (aggregate widgets only), Workflow Builder steps, Ask the SIS for AI-granted roles
- Exit: weekly leadership data meeting runs entirely from SIS dashboards.

### Phase 7 — Gradebook and assessments
- [ ] Courses, sections, categories, assignments, scores; keyboard score entry grid
- [ ] Standards tagging; mastery views
- [ ] IA import (xlsx) with item metadata; item analysis views
- [ ] Report card generation
- Exit (cutover): one full semester pilot with two teachers per grade; grades match Schoolrunner.

### Phase 8 — State reporting and retirement of Schoolrunner
- [ ] SIRS Level 0 exports with golden-file tests
- [ ] Year-end rollover: promote grades, close memberships, archive trackers
- [ ] Schoolrunner read-only archive export; decommission
- Exit: one full reporting cycle accepted by ESBOCES without format errors.

## Later modules

### SMS (text messaging)
Adds text as a delivery channel without changing the family or slip code.
- [ ] Choose provider; register for US business texting (A2P 10DLC), which can take weeks — start registration well before building
- [ ] Data agreement with the provider; family consent to texts captured on enrollment forms and in the portal
- [ ] Text sign-in codes for families; text delivery of slip links; opt-out (STOP) handling
- [ ] `sms` delivery channel registered with the family module; deliveries logged to the communication log
- [ ] Slack and staff notifications stay in Slack/email; SMS is for families only

### Period attendance
Not planned; add only if needed.

## Decisions made (October 2026)

1. Hosting: Google Cloud — Cloud Run + Cloud SQL (see Hosting).
2. AI: off by default; enabled only from the backend, by role or by individual user, optionally per feature. Any field may be sent to Claude under Creo's K-12 Claude agreement, limited to what the requesting user can already see.
3. Family portal: in scope for year one — simple, bilingual (English/Spanish), customizable visibility, custom weekly slips and progress reports.
4. Attendance: daily homeroom only. Period attendance is a possible future module.
5. Schema and module approval: Ben now; a small approver group later.
6. Build team: Ben + Claude Code.
7. Students: student portal with ask-a-teacher and weekly slip reflections, each toggleable in settings.
8. Identity: one `users` table for every sign-in (staff / student / family), linked to `staff`, `students`, or `contacts`; system users for imports and CLIs.
9. Student accounts are identified by Workspace OU (`/students` and its graduation-year sub-OUs), read from the Directory.
10. Staff can hold several roles (permissions are the union). The Google Group → role mapping is data, editable by admins; manual role assignments are allowed and survive Directory sync.
11. All staff see every student. Teacher assignments drive "my" views (classes, homeroom, gradebooks, attendance, behavior), not access. Sensitive fields remain gated by sensitivity level.
12. Sensitivity levels: `standard` < `restricted` (OSIS, contact details) < `sensitive` (IEP/504/ELL/health) < `confidential` (discipline narratives, family situation, safety). Ops sees `restricted`, not supports. The full role × sensitivity matrix is drafted in Phase 0 for sign-off.
13. Phase 0 pulls forward minimal versions (core columns only) of `students`, `contacts`, `student_contacts`, `enrollments`, `groups`, `group_memberships`, `family_accounts`, and `family_sessions`, so every role can be tested end to end. Full columns land in their own phases. Each module seeds its own history (attendance, behavior) when its schema lands.
14. Sessions are stored in the database and revocable (only a hash of the token is stored). Staff: 7 days, rolling. Families: 30 days per device. Students: end at 6 pm school time (shared devices); a sign-in after 6 pm lasts until 11:59 pm. Each surface has its own cookie (`/`, `/student`, `/family`). A session ends as soon as the person loses access (role ended, not enrolled, no children with portal access).
15. Audit log: kept forever; readable by `admin` and `leader` only, with values redacted to the reader's sensitivity level. Append-only at the database level.
16. AI grant resolution: user-level rows override role-level rows for the features they name; at the same level, revoke beats grant; `AI_ENABLED=false` overrides everything. `granted_by` comes from the operator's gcloud account.
17. `school_id` is on every table except `schools`; each user belongs to exactly one school for now.
18. Staff who are also Creo parents use a separate family identity with a personal email. A contact with portal access cannot use a `creoprep.org` address.
19. Dev sign-in is local-only: not on staging or production. Staging uses real Google sign-in with test accounts; load-test sessions are minted by a database-side script that refuses to run without the synthetic-data marker.
20. Phase 0 schema approved (`docs/decisions/0001-phase-0-schema.md`). Sensitivity: contact details are `standard`; teachers see `sensitive` fields only for students they're assigned to (via `group_staff`) and never `confidential`; `support` sees all levels; `coach` sees `standard` only; `admin` sees the same data as `leader`.
21. Write rules: any staff member may log behavior and family communication for any student; attendance is taken by the homeroom teacher plus ops, admin, and leader; grades by the section's teacher (Phase 7).
22. A student's Google account links to their record by exact match on `students.google_email`, imported from the Big Data Tracker; the graduation-year OU is a cross-check, and a mismatch is flagged for ops, not blocked.
23. The role and sensitivity matrix lives in one file, `src/core/permissions/matrix.ts`, mirroring the "Student Data Access Matrix" sign-off page (draft 1). Permissions are role → permission → scope (`all` or `homeroom`); sensitivity is role → levels for all students, plus levels for assigned students (teachers: `sensitive`). Fields with no declared sensitivity are hidden. Entries marked PROPOSED await sign-off by the Head of School and AP.
24. AI is available to a user only when `AI_ENABLED` is not `false`, an `ANTHROPIC_API_KEY` is set, and a grant applies. Personal grant/revoke rows override role rows for the features they cover; at the same level revoke beats grant. `ai:revoke --user` ends the person's grants and records a personal revoke; `ai:revoke --role` ends the role's grants.
25. Google sign-in uses `google-auth-library`, not Auth.js, so there is one session system (ADR 0002). Student sign-in checks the `/students` OU live in the Directory. Nightly jobs run as Cloud Run jobs started by Cloud Scheduler. Reset and seed are guarded by database name: only `creo_dev`, `*_test`, and confirmed `*_staging`.
26. Phase 1 schema approved (October 9, 2026), including basic attendance and behavior tables pulled forward to hold Schoolrunner history (read-only until Phases 3 and 4). Student photos are uploaded one at a time by ops. The Big Data Tracker lives in Notion. The Schoolrunner importer waits for an API key.

## Open decisions

1. Student portal beyond questions and reflections: should students also see grades, set goals, or fill in tracker fields (e.g. permission-slip status)?
2. Which languages beyond English and Spanish, if any, for families?
3. When to start the SMS module (provider, school number, carrier registration, family consent to texts).
4. Product name.
