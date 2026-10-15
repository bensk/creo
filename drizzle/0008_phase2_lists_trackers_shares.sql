CREATE TABLE "directory_group_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"google_group_email" "citext" NOT NULL,
	"staff_id" uuid NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"object_kind" text NOT NULL,
	"object_id" uuid NOT NULL,
	"user_id" uuid,
	"google_group_email" "citext",
	"access" text NOT NULL,
	CONSTRAINT "shares_kind_check" CHECK (object_kind in ('list', 'tracker', 'dashboard')),
	CONSTRAINT "shares_access_check" CHECK (access in ('view', 'edit')),
	CONSTRAINT "shares_target_check" CHECK ((user_id is null) <> (google_group_email is null))
);
--> statement-breakpoint
CREATE TABLE "list_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"list_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date,
	CONSTRAINT "list_members_dates_check" CHECK (ends_on is null or ends_on >= starts_on)
);
--> statement-breakpoint
CREATE TABLE "lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"school_year_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"kind" text NOT NULL,
	"spec" jsonb,
	"owner_staff_id" uuid NOT NULL,
	"sensitivity" text DEFAULT 'standard' NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "lists_kind_check" CHECK (kind in ('static', 'dynamic')),
	CONSTRAINT "lists_spec_check" CHECK ((kind = 'dynamic') = (spec is not null)),
	CONSTRAINT "lists_sensitivity_check" CHECK (sensitivity in ('standard', 'restricted', 'sensitive', 'confidential'))
);
--> statement-breakpoint
CREATE TABLE "tracker_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"tracker_id" uuid NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"type" text NOT NULL,
	"options" text[] DEFAULT '{}'::text[] NOT NULL,
	"computed" jsonb,
	"sensitivity" text DEFAULT 'standard' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "tracker_fields_type_check" CHECK (type in ('text', 'long_text', 'number', 'date', 'boolean', 'select', 'multi_select', 'computed')),
	CONSTRAINT "tracker_fields_computed_check" CHECK ((type = 'computed') = (computed is not null)),
	CONSTRAINT "tracker_fields_sensitivity_check" CHECK (sensitivity in ('standard', 'restricted', 'sensitive', 'confidential'))
);
--> statement-breakpoint
CREATE TABLE "tracker_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"tracker_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"added_on" date NOT NULL,
	"archived_on" date
);
--> statement-breakpoint
CREATE TABLE "tracker_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"population" jsonb,
	"owner_staff_id" uuid NOT NULL,
	"shared_with_school" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "trackers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"school_year_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"owner_staff_id" uuid NOT NULL,
	"population_kind" text NOT NULL,
	"population_source" text NOT NULL,
	"population_ref" uuid,
	"population_grade" smallint,
	"population_spec" jsonb,
	"sensitivity" text DEFAULT 'standard' NOT NULL,
	"template_id" uuid,
	"archived_at" timestamp with time zone,
	CONSTRAINT "trackers_kind_check" CHECK (population_kind in ('live', 'snapshot')),
	CONSTRAINT "trackers_source_check" CHECK (population_source in ('all', 'grade', 'group', 'list', 'spec')),
	CONSTRAINT "trackers_grade_check" CHECK ((population_source = 'grade') = (population_grade is not null) and (population_grade is null or population_grade between 5 and 8)),
	CONSTRAINT "trackers_ref_check" CHECK ((population_source in ('group', 'list')) = (population_ref is not null)),
	CONSTRAINT "trackers_spec_check" CHECK ((population_source = 'spec') = (population_spec is not null)),
	CONSTRAINT "trackers_sensitivity_check" CHECK (sensitivity in ('standard', 'restricted', 'sensitive', 'confidential'))
);
--> statement-breakpoint
ALTER TABLE "directory_group_members" ADD CONSTRAINT "directory_group_members_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory_group_members" ADD CONSTRAINT "directory_group_members_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory_group_members" ADD CONSTRAINT "directory_group_members_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_members" ADD CONSTRAINT "list_members_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_members" ADD CONSTRAINT "list_members_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_members" ADD CONSTRAINT "list_members_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_members" ADD CONSTRAINT "list_members_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_school_year_id_school_years_id_fk" FOREIGN KEY ("school_year_id") REFERENCES "public"."school_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_owner_staff_id_staff_id_fk" FOREIGN KEY ("owner_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker_fields" ADD CONSTRAINT "tracker_fields_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker_fields" ADD CONSTRAINT "tracker_fields_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker_fields" ADD CONSTRAINT "tracker_fields_tracker_id_trackers_id_fk" FOREIGN KEY ("tracker_id") REFERENCES "public"."trackers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker_rows" ADD CONSTRAINT "tracker_rows_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker_rows" ADD CONSTRAINT "tracker_rows_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker_rows" ADD CONSTRAINT "tracker_rows_tracker_id_trackers_id_fk" FOREIGN KEY ("tracker_id") REFERENCES "public"."trackers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker_rows" ADD CONSTRAINT "tracker_rows_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker_templates" ADD CONSTRAINT "tracker_templates_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker_templates" ADD CONSTRAINT "tracker_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker_templates" ADD CONSTRAINT "tracker_templates_owner_staff_id_staff_id_fk" FOREIGN KEY ("owner_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trackers" ADD CONSTRAINT "trackers_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trackers" ADD CONSTRAINT "trackers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trackers" ADD CONSTRAINT "trackers_school_year_id_school_years_id_fk" FOREIGN KEY ("school_year_id") REFERENCES "public"."school_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trackers" ADD CONSTRAINT "trackers_owner_staff_id_staff_id_fk" FOREIGN KEY ("owner_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trackers" ADD CONSTRAINT "trackers_template_id_tracker_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."tracker_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "directory_group_members_unique_idx" ON "directory_group_members" USING btree ("school_id","google_group_email","staff_id");--> statement-breakpoint
CREATE INDEX "directory_group_members_staff_idx" ON "directory_group_members" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "directory_group_members_created_by_idx" ON "directory_group_members" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "shares_object_idx" ON "shares" USING btree ("object_kind","object_id");--> statement-breakpoint
CREATE INDEX "shares_user_idx" ON "shares" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "shares_group_idx" ON "shares" USING btree ("school_id","google_group_email");--> statement-breakpoint
CREATE INDEX "shares_created_by_idx" ON "shares" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "list_members_list_idx" ON "list_members" USING btree ("list_id");--> statement-breakpoint
CREATE INDEX "list_members_student_idx" ON "list_members" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "list_members_school_idx" ON "list_members" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "list_members_created_by_idx" ON "list_members" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "lists_year_idx" ON "lists" USING btree ("school_year_id");--> statement-breakpoint
CREATE INDEX "lists_owner_idx" ON "lists" USING btree ("owner_staff_id");--> statement-breakpoint
CREATE INDEX "lists_school_idx" ON "lists" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "lists_created_by_idx" ON "lists" USING btree ("created_by");--> statement-breakpoint
CREATE UNIQUE INDEX "tracker_fields_key_idx" ON "tracker_fields" USING btree ("tracker_id","key");--> statement-breakpoint
CREATE INDEX "tracker_fields_school_idx" ON "tracker_fields" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "tracker_fields_created_by_idx" ON "tracker_fields" USING btree ("created_by");--> statement-breakpoint
CREATE UNIQUE INDEX "tracker_rows_tracker_student_idx" ON "tracker_rows" USING btree ("tracker_id","student_id");--> statement-breakpoint
CREATE INDEX "tracker_rows_student_idx" ON "tracker_rows" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "tracker_rows_school_idx" ON "tracker_rows" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "tracker_rows_created_by_idx" ON "tracker_rows" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "tracker_templates_owner_idx" ON "tracker_templates" USING btree ("owner_staff_id");--> statement-breakpoint
CREATE INDEX "tracker_templates_school_idx" ON "tracker_templates" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "tracker_templates_created_by_idx" ON "tracker_templates" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "trackers_year_idx" ON "trackers" USING btree ("school_year_id");--> statement-breakpoint
CREATE INDEX "trackers_owner_idx" ON "trackers" USING btree ("owner_staff_id");--> statement-breakpoint
CREATE INDEX "trackers_template_idx" ON "trackers" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "trackers_school_idx" ON "trackers" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "trackers_created_by_idx" ON "trackers" USING btree ("created_by");