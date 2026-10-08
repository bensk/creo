-- Hand-written: rules drizzle-kit cannot express.

-- 1. Effective-dated rows may not overlap for the same pair. ends_on is the last
--    day included ('[]'); a null ends_on means ongoing.
ALTER TABLE "staff_roles" ADD CONSTRAINT "staff_roles_no_overlap"
  EXCLUDE USING gist (staff_id WITH =, role WITH =, source WITH =, daterange(starts_on, ends_on, '[]') WITH &&);--> statement-breakpoint
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_no_overlap"
  EXCLUDE USING gist (group_id WITH =, student_id WITH =, daterange(starts_on, ends_on, '[]') WITH &&);--> statement-breakpoint
ALTER TABLE "group_staff" ADD CONSTRAINT "group_staff_no_overlap"
  EXCLUDE USING gist (group_id WITH =, staff_id WITH =, function WITH =, daterange(starts_on, ends_on, '[]') WITH &&);--> statement-breakpoint
ALTER TABLE "student_contacts" ADD CONSTRAINT "student_contacts_no_overlap"
  EXCLUDE USING gist (student_id WITH =, contact_id WITH =, daterange(starts_on, ends_on, '[]') WITH &&);--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_no_overlap"
  EXCLUDE USING gist (student_id WITH =, daterange(entry_date, exit_date, '[]') WITH &&);--> statement-breakpoint

-- 2. audit_log and sensitive_reads are append-only and kept forever. The trigger
--    blocks UPDATE, DELETE, and TRUNCATE for every role, including the owner.
CREATE FUNCTION reject_append_only_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; % is not allowed', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;--> statement-breakpoint
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION reject_append_only_change();--> statement-breakpoint
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON "audit_log"
  FOR EACH STATEMENT EXECUTE FUNCTION reject_append_only_change();--> statement-breakpoint
CREATE TRIGGER sensitive_reads_append_only BEFORE UPDATE OR DELETE ON "sensitive_reads"
  FOR EACH ROW EXECUTE FUNCTION reject_append_only_change();--> statement-breakpoint
CREATE TRIGGER sensitive_reads_no_truncate BEFORE TRUNCATE ON "sensitive_reads"
  FOR EACH STATEMENT EXECUTE FUNCTION reject_append_only_change();--> statement-breakpoint

-- 3. The app connects as creo_app, never as the owner that runs migrations.
--    Locally the role is created with a login by docker/postgres-init; in Cloud
--    SQL, Terraform grants it to the app's IAM user. Created here only if missing.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'creo_app') THEN
    CREATE ROLE creo_app NOLOGIN;
  END IF;
END
$$;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO creo_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO creo_app;--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON "audit_log", "sensitive_reads" FROM creo_app;--> statement-breakpoint
-- Tables created by later migrations get the same default grants. Any new
-- append-only table must revoke UPDATE/DELETE in its own migration.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO creo_app;
