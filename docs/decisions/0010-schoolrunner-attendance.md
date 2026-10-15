# 0010 — Schoolrunner attendance import and the parallel run

**Status:** accepted (Ben, October 15, 2026)

## Source

Schoolrunner's **Daily Attendance Absence Export**: one CSV per day, one row per student (present included), with `SIS Student Number` (the OSIS; `SR Student Number` matches it, `State ID` is empty), `Date`, `Absence Type Code`, `Comments` (an arrival time on many tardies), `Teammate`, a teacher-named `Homeroom`, and up to five sets of family contact columns.

## Decisions

- **Uploaded on the Imports page** (admin, ops), several days at a time, with a preview that runs the whole import and rolls it back.
- **Matched by OSIS.** The homeroom column is ignored (Schoolrunner names homerooms by teacher; the SIS uses colleges). Contact columns are never read: Clever's files are the contact source.
- **The SIS keeps what staff entered.** For each student and day: no SIS mark → filled in (`source = import`); an imported mark → updated if Schoolrunner changed; a mark staff entered in the SIS → never overwritten, and a disagreement is listed as a **difference**. That list is the reconciliation the cutover criterion asks for (four weeks with no unexplained differences). Each run's per-day counts are kept in `import_runs`.
- **Codes.** Creo's codes are P / T / A / E plus ET (excused tardy, counts as tardy), ISS (in-school suspension, counts as present), and OSS (out-of-school suspension, counts as excused absence). All staff see them, as in Schoolrunner. Homeroom teachers mark only P / T / A / E by key; ops, admins, and leaders set ET / ISS / OSS from a menu. Missing codes are created on import.
- **Arrival times** come from a comment that starts with a time ("9:15", "1:05" read as afternoon) on a tardy, in New York time.
- **Days off** on the SIS calendar are skipped and reported. Students enrolled in the SIS but missing from a day's export are listed.
- **Real data only in production**, as for Clever: a synthetic database refuses files with OSIS numbers that don't start with 999.
