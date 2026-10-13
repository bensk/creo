-- Effective-dated section rows may not overlap for the same pair (same rule as
-- group memberships and group staff in 0002).
ALTER TABLE "section_enrollments" ADD CONSTRAINT "section_enrollments_no_overlap"
  EXCLUDE USING gist (section_id WITH =, student_id WITH =, daterange(starts_on, ends_on, '[]') WITH &&);--> statement-breakpoint
ALTER TABLE "section_staff" ADD CONSTRAINT "section_staff_no_overlap"
  EXCLUDE USING gist (section_id WITH =, staff_id WITH =, daterange(starts_on, ends_on, '[]') WITH &&);
