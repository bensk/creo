# 0004 — Query engine v1 and the student grid

Status: accepted

## Query engine

- **One spec** (`core/query/spec.ts`): source, filters (field / operator / value), free-text search, sort, columns, limit. Grid filters, saved views, and later lists, rules, and dashboards all use it.
- **Sources and fields are registered by modules.** The students module owns the `students` source; cohorts, attendance, and behavior add fields to it through `sourceFields` in their manifests. Each field is an SQL expression written in code with a declared type and sensitivity. Specs only name fields; user values are always bound parameters.
- **Sensitivity is enforced in the compiler**, not the UI:
  - a field the viewer can't see at all is dropped from the results;
  - a field the viewer sees only for students they work with (teachers and `sensitive`) comes back empty for everyone else, and the column is marked partial;
  - filtering or sorting on a field requires seeing it for **every** row, because a filter on "has an IEP" would otherwise reveal who has one;
  - every above-standard column returned is logged in `sensitive_reads` (one entry per field per query).
- Operators are checked against the field type, values against the operator (numbers, dates, enum options), and lists are capped.

## Student grid

- **Glide Data Grid 6.0.4-alpha24**, pinned exactly. It is the only Glide release that supports React 19 (the latest stable, 6.0.3, stops at React 18). CLAUDE.md chose Glide for 1,000 × 60 grids at 60 fps; if the prerelease causes problems, the fallback is TanStack Table with a virtualizer.
- Do **not** pass a partial `keybindings` prop: this release treats it as the full set and turns off arrow-key navigation.
- The grid draws on a canvas, so it loads client-side only; overlay editors render into `#portal` in the root layout. Colors are read from the Creo CSS variables and follow light/dark changes.
- Editable cells (preferred first name, pronouns, medical alert, photo consent) commit optimistically, reconcile with the server, and use the student's `version` column: a stale edit is refused with "Someone else changed this student", never written over. Each edit is audited.
- New permission `students.edit_alerts` (ops, support, leader, admin; PROPOSED until the access matrix is signed off) for the medical alert and photo consent.
- Saved views are private or shared with all staff; sharing a view never shares data, because every viewer's query still runs through their own permissions.

## Not yet

Bulk edit, custom-field columns, and showing other people's edits live (Server-Sent Events) come next.
