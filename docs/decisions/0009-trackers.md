# 0009 — Trackers

**Status:** accepted, October 2026

## Decisions

- **Populations resolve as the owner.** A live tracker shows the same students to everyone who opens it, so its population (a grade, a group, a list, or a filter) is worked out with the owner's permissions, not the viewer's. Who may open it at all is decided by sharing and sensitivity (ADR 0008). If the owner leaves, the person opening it stands in.
- **Live trackers catch up when opened.** Opening a live tracker adds rows for new students, sets aside (archives) rows for students who left, and brings back returning students with their answers. Each catch-up writes one audit entry with counts. A nightly job can do the same once pg-boss arrives; nothing depends on it.
- **Cells are compare-and-set.** A save carries the value the editor saw in that cell, and the update only applies if the cell still holds it (checked inside the UPDATE). Two people editing different cells of one student don't collide; two editing the same cell do, and the second is told. The row's `version` still counts changes. Values are written with `jsonb_set`, one key at a time.
- **Computed columns run as the viewer.** They are student-source fields run through the query engine with each viewer's permissions, so a teacher sees an assigned-only field (e.g. IEP) only for their own students, with the column marked. A "counting from" date overrides the start of the school year for "this year" fields (attendance rate since Sept 1).
- **Typed columns carry a sensitivity**, chosen by whoever adds them. Above standard, they show only to the owner and to roles that see that level for every student, and each view is logged in `sensitive_reads`. Adding a column that would make the tracker more sensitive than someone it's shared with may see is refused, naming who.
- **Columns are archived, not deleted,** and students leaving a tracker are archived, so answers are never lost.
- **CSV download now; Google Sheets later.** The download holds only the columns the downloader can see and is audited. Creating a Google Sheet in the person's Drive needs a Drive permission at sign-in; that's a separate decision.
- **The name search never goes in a link.** "Track these students" from the grid carries only the filters; with a name search active, the button explains why it's off.
