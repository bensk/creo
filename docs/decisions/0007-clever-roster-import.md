# 0007 — Clever roster files instead of the Schoolrunner API

**Status:** accepted (Ben, October 13, 2026)

## Context

The plan was to import Schoolrunner through its API, which needs a key. Schoolrunner already sends Creo's roster to Clever as the six standard Clever SFTP files (`schools`, `students`, `teachers`, `staff`, `sections`, `enrollments`), so the same files can come to the SIS.

## Decisions

- **Upload, always available.** Admins and ops upload the six files on the Imports page. The preview runs the whole import in a transaction and rolls it back, so its counts are exact; confirming runs it for real. A command-line or automated path can be added later without changing the importer.
- **Clever wins over the Big Data Tracker** for the fields it carries: legal names, OSIS, DOB, grade, homeroom (from homeroom sections), contacts, IEP and ELL status, gender, race and ethnicity, and address. For a student Clever has, the tracker import is fill-only: photo consent, health, the meal form, 504 plans, and testing accommodations on an IEP Clever reported.
- **Sections are new tables** (`courses`, `sections`, `section_staff`, `section_enrollments`; effective-dated, no overlaps). Each file is a full snapshot: a teacher or student missing from a section ends yesterday, and a section missing from the file is archived. Teaching a section counts as an assignment, so section teachers see sensitive fields (e.g. accommodations) for their section's students.
- **Homerooms** come from sections whose course or name says "Homeroom", or which have no course and are named after an existing homeroom. A class like "Math - Syracuse" is not a homeroom. The preview lists which sections were read as homerooms.
- **Matching:** students by Clever ID, then OSIS. Contacts by Clever key, then by name among the student's current contacts, so the tracker and Clever don't create the same parent twice. A blank phone or email in Clever never erases one the SIS has. Teachers by email to staff from Google Directory; Directory stays the source for staff and roles.
- **Never imported:** `Username`, `Password`, `Student_email` (Directory links student accounts), `Frl_status` (no approved home), and any `creoprep.org` contact email.
- **Not automatic:** students missing from the file are reported, never withdrawn.
- **Real data stays in production.** A database that is synthetic (or named dev, test, or staging) refuses any file whose OSIS doesn't start with 999.
- **Later, the other direction.** Clever's IDs for students, sections, courses, and contacts are kept in `external_ids`, so when the SIS becomes the roster source it can write the same six files with the same IDs.

Attendance, behavior, and communication history are not in Clever's files; they still come from Schoolrunner's own exports.
