CREATE TABLE "ai_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"role" text,
	"user_id" uuid,
	"effect" text NOT NULL,
	"features" text[],
	"note" text,
	"ended_at" timestamp with time zone,
	"ended_by" uuid,
	CONSTRAINT "ai_grants_target_check" CHECK (num_nonnulls(role, user_id) = 1),
	CONSTRAINT "ai_grants_role_check" CHECK (role is null or role in ('admin', 'leader', 'ops', 'teacher', 'support', 'coach')),
	CONSTRAINT "ai_grants_effect_check" CHECK (effect in ('grant', 'revoke')),
	CONSTRAINT "ai_grants_ended_check" CHECK ((ended_at is null) = (ended_by is null))
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" uuid,
	"before" jsonb,
	"after" jsonb,
	"via" text NOT NULL,
	"request_id" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_log_via_check" CHECK (via in ('app', 'slack', 'cli', 'import', 'dev', 'system'))
);
--> statement-breakpoint
CREATE TABLE "sensitive_reads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"entity" text NOT NULL,
	"entity_id" uuid,
	"field" text NOT NULL,
	"via" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sensitive_reads_via_check" CHECK (via in ('app', 'slack', 'cli', 'import', 'dev', 'system'))
);
--> statement-breakpoint
CREATE TABLE "role_group_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"google_group_email" "citext" NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT "role_group_mappings_role_check" CHECK (role in ('admin', 'leader', 'ops', 'teacher', 'support', 'coach'))
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"surface" text NOT NULL,
	"method" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "sessions_surface_check" CHECK (surface in ('staff', 'student', 'family')),
	CONSTRAINT "sessions_method_check" CHECK (method in ('google', 'email_code', 'dev'))
);
--> statement-breakpoint
CREATE TABLE "staff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"email" "citext" NOT NULL,
	"google_user_id" text,
	"given_name" text NOT NULL,
	"family_name" text NOT NULL,
	"preferred_name" text,
	"title" text,
	"status" text DEFAULT 'active' NOT NULL,
	"org_unit_path" text,
	"directory_synced_at" timestamp with time zone,
	"custom" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "staff_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "staff_google_user_id_unique" UNIQUE("google_user_id"),
	CONSTRAINT "staff_status_check" CHECK (status in ('active', 'inactive'))
);
--> statement-breakpoint
CREATE TABLE "staff_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"role" text NOT NULL,
	"source" text NOT NULL,
	"source_group_email" "citext",
	"starts_on" date NOT NULL,
	"ends_on" date,
	CONSTRAINT "staff_roles_role_check" CHECK (role in ('admin', 'leader', 'ops', 'teacher', 'support', 'coach')),
	CONSTRAINT "staff_roles_source_check" CHECK (source in ('directory', 'manual')),
	CONSTRAINT "staff_roles_source_group_check" CHECK ((source = 'directory') = (source_group_email is not null)),
	CONSTRAINT "staff_roles_dates_check" CHECK (ends_on is null or ends_on >= starts_on)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"kind" text NOT NULL,
	"email" "citext",
	"display_name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"last_sign_in_at" timestamp with time zone,
	CONSTRAINT "users_kind_check" CHECK (kind in ('staff', 'student', 'family', 'system')),
	CONSTRAINT "users_status_check" CHECK (status in ('active', 'disabled')),
	CONSTRAINT "users_email_check" CHECK ((kind = 'system') = (email is null))
);
--> statement-breakpoint
CREATE TABLE "schools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"dbn" text NOT NULL,
	"timezone" text DEFAULT 'America/New_York' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schools_dbn_unique" UNIQUE("dbn")
);
--> statement-breakpoint
CREATE TABLE "school_years" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"label" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	CONSTRAINT "school_years_dates_check" CHECK ("school_years"."ends_on" > "school_years"."starts_on")
);
--> statement-breakpoint
CREATE TABLE "group_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date,
	CONSTRAINT "group_memberships_dates_check" CHECK (ends_on is null or ends_on >= starts_on)
);
--> statement-breakpoint
CREATE TABLE "group_staff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"function" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date,
	CONSTRAINT "group_staff_function_check" CHECK (function in ('homeroom_teacher', 'lead', 'member')),
	CONSTRAINT "group_staff_dates_check" CHECK (ends_on is null or ends_on >= starts_on)
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"school_year_id" uuid NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"grade_level" smallint,
	"owner_staff_id" uuid,
	"google_group_email" "citext",
	"archived_at" timestamp with time zone,
	CONSTRAINT "groups_type_check" CHECK (type in ('homeroom', 'grade_team', 'advisory', 'intervention', 'club', 'team', 'custom')),
	CONSTRAINT "groups_grade_check" CHECK (grade_level is null or grade_level between 5 and 8)
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"user_id" uuid,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" "citext",
	"phone_primary" text,
	"phone_secondary" text,
	"language" text DEFAULT 'en' NOT NULL,
	"preferred_channel" text,
	CONSTRAINT "contacts_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "contacts_email_not_creo_check" CHECK (email is null or email !~* '@([a-z0-9-]+\.)*creoprep\.org$'),
	CONSTRAINT "contacts_preferred_channel_check" CHECK (preferred_channel is null or preferred_channel in ('email', 'phone', 'text', 'in_person'))
);
--> statement-breakpoint
CREATE TABLE "enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"school_year_id" uuid NOT NULL,
	"grade_level" smallint NOT NULL,
	"status" text NOT NULL,
	"entry_date" date NOT NULL,
	"exit_date" date,
	"entry_code" text,
	"exit_code" text,
	CONSTRAINT "enrollments_grade_check" CHECK (grade_level between 5 and 8),
	CONSTRAINT "enrollments_status_check" CHECK (status in ('active', 'withdrawn', 'completed')),
	CONSTRAINT "enrollments_dates_check" CHECK (exit_date is null or exit_date >= entry_date)
);
--> statement-breakpoint
CREATE TABLE "student_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"relationship" text NOT NULL,
	"is_guardian" boolean DEFAULT false NOT NULL,
	"lives_with" boolean DEFAULT false NOT NULL,
	"pickup_allowed" boolean DEFAULT false NOT NULL,
	"contact_priority" smallint,
	"portal_access" boolean DEFAULT false NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date,
	CONSTRAINT "student_contacts_dates_check" CHECK (ends_on is null or ends_on >= starts_on)
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"user_id" uuid,
	"legal_first_name" text NOT NULL,
	"legal_last_name" text NOT NULL,
	"preferred_first_name" text,
	"preferred_last_name" text,
	"pronouns" text,
	"date_of_birth" date,
	"osis" text,
	"google_email" "citext",
	"custom" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "students_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "students_osis_check" CHECK (osis is null or osis ~ '^[0-9]{9}$')
);
--> statement-breakpoint
ALTER TABLE "ai_grants" ADD CONSTRAINT "ai_grants_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_grants" ADD CONSTRAINT "ai_grants_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_grants" ADD CONSTRAINT "ai_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_grants" ADD CONSTRAINT "ai_grants_ended_by_users_id_fk" FOREIGN KEY ("ended_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sensitive_reads" ADD CONSTRAINT "sensitive_reads_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sensitive_reads" ADD CONSTRAINT "sensitive_reads_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_group_mappings" ADD CONSTRAINT "role_group_mappings_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_group_mappings" ADD CONSTRAINT "role_group_mappings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_roles" ADD CONSTRAINT "staff_roles_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_roles" ADD CONSTRAINT "staff_roles_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_roles" ADD CONSTRAINT "staff_roles_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_years" ADD CONSTRAINT "school_years_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_years" ADD CONSTRAINT "school_years_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_staff" ADD CONSTRAINT "group_staff_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_staff" ADD CONSTRAINT "group_staff_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_staff" ADD CONSTRAINT "group_staff_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_staff" ADD CONSTRAINT "group_staff_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_school_year_id_school_years_id_fk" FOREIGN KEY ("school_year_id") REFERENCES "public"."school_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_owner_staff_id_staff_id_fk" FOREIGN KEY ("owner_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_school_year_id_school_years_id_fk" FOREIGN KEY ("school_year_id") REFERENCES "public"."school_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_contacts" ADD CONSTRAINT "student_contacts_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_contacts" ADD CONSTRAINT "student_contacts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_contacts" ADD CONSTRAINT "student_contacts_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_contacts" ADD CONSTRAINT "student_contacts_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_grants_school_idx" ON "ai_grants" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "ai_grants_user_idx" ON "ai_grants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_grants_created_by_idx" ON "ai_grants" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "ai_grants_ended_by_idx" ON "ai_grants" USING btree ("ended_by");--> statement-breakpoint
CREATE INDEX "audit_log_school_at_idx" ON "audit_log" USING btree ("school_id","at");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_actor_at_idx" ON "audit_log" USING btree ("actor_user_id","at");--> statement-breakpoint
CREATE INDEX "sensitive_reads_school_at_idx" ON "sensitive_reads" USING btree ("school_id","at");--> statement-breakpoint
CREATE INDEX "sensitive_reads_entity_idx" ON "sensitive_reads" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "sensitive_reads_actor_at_idx" ON "sensitive_reads" USING btree ("actor_user_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "role_group_mappings_unique_idx" ON "role_group_mappings" USING btree ("school_id","google_group_email","role");--> statement-breakpoint
CREATE INDEX "role_group_mappings_created_by_idx" ON "role_group_mappings" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_school_idx" ON "sessions" USING btree ("school_id");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_school_email_idx" ON "staff" USING btree ("school_id","email");--> statement-breakpoint
CREATE INDEX "staff_created_by_idx" ON "staff" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "staff_roles_staff_idx" ON "staff_roles" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "staff_roles_school_idx" ON "staff_roles" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "staff_roles_created_by_idx" ON "staff_roles" USING btree ("created_by");--> statement-breakpoint
CREATE UNIQUE INDEX "users_staff_student_email_idx" ON "users" USING btree ("school_id","email") WHERE kind in ('staff', 'student');--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_school_idx" ON "users" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "users_created_by_idx" ON "users" USING btree ("created_by");--> statement-breakpoint
CREATE UNIQUE INDEX "school_years_school_label_idx" ON "school_years" USING btree ("school_id","label");--> statement-breakpoint
CREATE INDEX "school_years_created_by_idx" ON "school_years" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "group_memberships_group_idx" ON "group_memberships" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "group_memberships_student_idx" ON "group_memberships" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "group_memberships_school_idx" ON "group_memberships" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "group_memberships_created_by_idx" ON "group_memberships" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "group_staff_group_idx" ON "group_staff" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "group_staff_staff_idx" ON "group_staff" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "group_staff_school_idx" ON "group_staff" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "group_staff_created_by_idx" ON "group_staff" USING btree ("created_by");--> statement-breakpoint
CREATE UNIQUE INDEX "groups_year_type_name_idx" ON "groups" USING btree ("school_year_id","type","name");--> statement-breakpoint
CREATE INDEX "groups_school_idx" ON "groups" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "groups_owner_idx" ON "groups" USING btree ("owner_staff_id");--> statement-breakpoint
CREATE INDEX "groups_created_by_idx" ON "groups" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "contacts_school_idx" ON "contacts" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "contacts_email_idx" ON "contacts" USING btree ("email");--> statement-breakpoint
CREATE INDEX "contacts_created_by_idx" ON "contacts" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "enrollments_student_idx" ON "enrollments" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "enrollments_school_year_idx" ON "enrollments" USING btree ("school_year_id","grade_level");--> statement-breakpoint
CREATE INDEX "enrollments_school_idx" ON "enrollments" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "enrollments_created_by_idx" ON "enrollments" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "student_contacts_student_idx" ON "student_contacts" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "student_contacts_contact_idx" ON "student_contacts" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "student_contacts_school_idx" ON "student_contacts" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "student_contacts_created_by_idx" ON "student_contacts" USING btree ("created_by");--> statement-breakpoint
CREATE UNIQUE INDEX "students_school_osis_idx" ON "students" USING btree ("school_id","osis");--> statement-breakpoint
CREATE UNIQUE INDEX "students_school_google_email_idx" ON "students" USING btree ("school_id","google_email");--> statement-breakpoint
CREATE INDEX "students_created_by_idx" ON "students" USING btree ("created_by");