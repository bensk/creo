-- A student can't be on the same static list twice at once (same rule as group memberships).
ALTER TABLE "list_members" ADD CONSTRAINT "list_members_no_overlap"
  EXCLUDE USING gist (list_id WITH =, student_id WITH =, daterange(starts_on, ends_on, '[]') WITH &&);
