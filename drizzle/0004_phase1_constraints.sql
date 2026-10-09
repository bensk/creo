-- Hand-written: rules drizzle-kit cannot express.

-- A student can't have two overlapping periods of the same support type.
ALTER TABLE "student_supports" ADD CONSTRAINT "student_supports_no_overlap"
  EXCLUDE USING gist (student_id WITH =, type WITH =, daterange(starts_on, ends_on, '[]') WITH &&);
