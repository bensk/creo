# 0003 — Big Data Tracker import (Notion)

Status: accepted for the fields below; the rest awaits schema decisions.

## Source

The "26-27 Big Data Tracker" is a Notion database (data source `8fa793d2-4076-83cc-85a1-0787fd77e7c1`). Earlier years' trackers were Google Sheets. The importer reads it through a Notion internal integration with **read content only**, connected to that one database. Each school year the new tracker is connected and the data source ID updated.

## What is imported now (approved schema)

| Tracker column(s) | SIS |
|---|---|
| First, Last | `students.legal_first_name`, `legal_last_name` (the tracker owns legal names; preferred names belong to the SIS) |
| OSIS (a number in Notion) | `students.osis`, zero-padded to nine digits |
| DOB | `students.date_of_birth` |
| Grade, Start Date, ATS Status = Withdrawn | this year's `enrollments` (grade, entry date, withdrawn) |
| Homeroom, e.g. "7 - Albany Shaniah & Lily", "8 - USC (ICT)" | homeroom group **Albany** / **USC** for the grade; teacher names are dropped; "(ICT)" is read but not stored yet |
| Guardian Name/Relation/Phone 1/Phone 2/Email | contact, guardian, priority 1 |
| 2nd Guardian … | contact, guardian, priority 2 |
| Emergency Contact Name/Relation/Phone | contact, not a guardian |
| IEP = Received / Missing IEP / 504, plus Testing Accommodation(s) | `student_supports` (iep with "not yet received" note for Missing IEP; 504), source `import`, accommodations listed |

Matching: Notion page ID (kept in `external_ids`), then OSIS. Two rows with the same OSIS are both skipped and reported. Imports never grant portal access, never touch preferred names, pronouns, custom fields, or manually entered supports, and never write `creoprep.org` emails to contacts. Homeroom changes end the old membership yesterday and start the new one today. An import-sourced IEP or 504 the tracker stops reporting is ended, not deleted.

Errors are reported by row number and column only. The importer refuses any dev, test, staging, or synthetic database: real student data only ever lands in production.

## Not imported yet

These columns have no approved home and are left alone until a schema change is approved for them:

- **Demographics and address** (Gender, Ethnicity, Home Address, FRP/meals): needed for state reporting (Phase 8); restricted or sensitive.
- **Health** (Allergies, Allergen/Reaction/Treatment, Asthma, MAFs, Immunization, Physical, Lunch Accommodations): sensitive; see access matrix question 1 (medical alerts).
- **"No IEP – interested in evaluation"** and **Flag Status** (e.g. 12:1:1 IEP, Retained, Academic concern, First Year in States): sensitive; need a decision on where they live.
- **Scores** (iReady, NYS, IA, Regents): assessments, Phase 7.
- **Schedules** (Period 1–4, POR, Study Hall, Literacy Group, Advisor, Math/Algebra): sections and groups, Phases 2 and 7.
- **Operational checkboxes and paperwork** (Seat sack, Locker, Phone pouch, Class supplies, Birth Certificate, Custody Forms, files, SchoolMint/Schoolrunner flags, Google account created, …): the case trackers exist for; move into an "Enrollment and onboarding" tracker in Phase 2.
- **Student Cell, Social Media (photo consent), Dismissal**: candidates for custom fields; photo consent matters for privacy and should be decided soon.
