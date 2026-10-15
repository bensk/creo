CREATE TABLE "courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"school_year_id" uuid NOT NULL,
	"name" text NOT NULL,
	"number" text,
	"subject" text,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "section_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date,
	CONSTRAINT "section_enrollments_dates_check" CHECK (ends_on is null or ends_on >= starts_on)
);
--> statement-breakpoint
CREATE TABLE "section_staff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"role" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date,
	CONSTRAINT "section_staff_role_check" CHECK (role in ('primary', 'co_teacher')),
	CONSTRAINT "section_staff_dates_check" CHECK (ends_on is null or ends_on >= starts_on)
);
--> statement-breakpoint
CREATE TABLE "sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"school_year_id" uuid NOT NULL,
	"course_id" uuid,
	"name" text NOT NULL,
	"section_number" text,
	"period" text,
	"grade_level" smallint,
	"term_name" text,
	"term_starts_on" date,
	"term_ends_on" date,
	"archived_at" timestamp with time zone,
	CONSTRAINT "sections_grade_check" CHECK (grade_level is null or grade_level between 5 and 8),
	CONSTRAINT "sections_term_check" CHECK (term_ends_on is null or term_starts_on is null or term_ends_on >= term_starts_on)
);
--> statement-breakpoint
ALTER TABLE "external_ids" DROP CONSTRAINT "external_ids_source_check";--> statement-breakpoint
ALTER TABLE "import_runs" DROP CONSTRAINT "import_runs_source_check";--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_school_year_id_school_years_id_fk" FOREIGN KEY ("school_year_id") REFERENCES "public"."school_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_enrollments" ADD CONSTRAINT "section_enrollments_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_enrollments" ADD CONSTRAINT "section_enrollments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_enrollments" ADD CONSTRAINT "section_enrollments_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_enrollments" ADD CONSTRAINT "section_enrollments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_staff" ADD CONSTRAINT "section_staff_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_staff" ADD CONSTRAINT "section_staff_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_staff" ADD CONSTRAINT "section_staff_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_staff" ADD CONSTRAINT "section_staff_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_school_year_id_school_years_id_fk" FOREIGN KEY ("school_year_id") REFERENCES "public"."school_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "courses_year_number_idx" ON "courses" USING btree ("school_year_id","number");--> statement-breakpoint
CREATE INDEX "courses_school_idx" ON "courses" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "courses_created_by_idx" ON "courses" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "section_enrollments_section_idx" ON "section_enrollments" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "section_enrollments_student_idx" ON "section_enrollments" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "section_enrollments_school_idx" ON "section_enrollments" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "section_enrollments_created_by_idx" ON "section_enrollments" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "section_staff_section_idx" ON "section_staff" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "section_staff_staff_idx" ON "section_staff" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "section_staff_school_idx" ON "section_staff" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "section_staff_created_by_idx" ON "section_staff" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "sections_year_idx" ON "sections" USING btree ("school_year_id");--> statement-breakpoint
CREATE INDEX "sections_course_idx" ON "sections" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "sections_school_idx" ON "sections" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "sections_created_by_idx" ON "sections" USING btree ("created_by");--> statement-breakpoint
ALTER TABLE "external_ids" ADD CONSTRAINT "external_ids_source_check" CHECK (source in ('big_data_tracker', 'schoolrunner', 'clever'));--> statement-breakpoint
ALTER TABLE "import_runs" ADD CONSTRAINT "import_runs_source_check" CHECK (source in ('big_data_tracker', 'schoolrunner', 'clever'));