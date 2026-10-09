CREATE TABLE "saved_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"source" text NOT NULL,
	"spec" jsonb NOT NULL,
	"columns" text[] DEFAULT '{}'::text[] NOT NULL,
	"sharing" text DEFAULT 'private' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "saved_views_sharing_check" CHECK (sharing in ('private', 'school'))
);
--> statement-breakpoint
CREATE TABLE "attendance_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"counts_as" text NOT NULL,
	"sirs_code" text,
	"position" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "attendance_codes_counts_as_check" CHECK (counts_as in ('present', 'absent', 'tardy', 'excused'))
);
--> statement-breakpoint
CREATE TABLE "attendance_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"date" date NOT NULL,
	"code_id" uuid NOT NULL,
	"note" text,
	"source" text DEFAULT 'sis' NOT NULL,
	CONSTRAINT "attendance_daily_source_check" CHECK (source in ('sis', 'import'))
);
--> statement-breakpoint
CREATE TABLE "behavior_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"type_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"location" text,
	"staff_id" uuid,
	"points" smallint NOT NULL,
	"narrative" text,
	"source" text DEFAULT 'sis' NOT NULL,
	CONSTRAINT "behavior_events_source_check" CHECK (source in ('sis', 'import'))
);
--> statement-breakpoint
CREATE TABLE "behavior_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"label" text NOT NULL,
	"valence" text NOT NULL,
	"points" smallint DEFAULT 0 NOT NULL,
	"skill" text,
	"requires_followup" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "behavior_types_valence_check" CHECK (valence in ('positive', 'negative'))
);
--> statement-breakpoint
CREATE TABLE "external_ids" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"entity" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	CONSTRAINT "external_ids_source_check" CHECK (source in ('big_data_tracker', 'schoolrunner'))
);
--> statement-breakpoint
CREATE TABLE "import_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"source" text NOT NULL,
	"kind" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text DEFAULT 'running' NOT NULL,
	"counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_summary" text,
	CONSTRAINT "import_runs_source_check" CHECK (source in ('big_data_tracker', 'schoolrunner')),
	CONSTRAINT "import_runs_status_check" CHECK (status in ('running', 'succeeded', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "slack_channel_allowlist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"channel_id" text NOT NULL,
	"is_private" boolean NOT NULL,
	"allow_names" boolean DEFAULT false NOT NULL,
	"approved_by" uuid NOT NULL,
	CONSTRAINT "slack_channel_allowlist_names_check" CHECK (not allow_names or is_private)
);
--> statement-breakpoint
CREATE TABLE "slack_installation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"team_id" text NOT NULL,
	"bot_token_secret" text NOT NULL,
	"installed_by" uuid NOT NULL,
	"scopes" text[] DEFAULT '{}'::text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slack_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"channel_id" text NOT NULL,
	"ts" text NOT NULL,
	"notification_type" text NOT NULL,
	"detail_level" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "slack_messages_detail_check" CHECK (detail_level in ('counts', 'initials', 'names'))
);
--> statement-breakpoint
CREATE TABLE "slack_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"notification_type" text NOT NULL,
	"target" text NOT NULL,
	"channel_id" text,
	"dm_role" text,
	"schedule" text,
	"detail_level" text DEFAULT 'counts' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	CONSTRAINT "slack_rules_target_check" CHECK (target in ('channel', 'dm_role', 'dm_owner')),
	CONSTRAINT "slack_rules_detail_check" CHECK (detail_level in ('counts', 'initials', 'names')),
	CONSTRAINT "slack_rules_channel_check" CHECK ((target = 'channel') = (channel_id is not null)),
	CONSTRAINT "slack_rules_dm_role_check" CHECK ((target = 'dm_role') = (dm_role is not null))
);
--> statement-breakpoint
CREATE TABLE "slack_user_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"slack_user_id" text NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "slack_user_links_staff_id_unique" UNIQUE("staff_id")
);
--> statement-breakpoint
CREATE TABLE "custom_field_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"entity" text NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"type" text NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"sensitivity" text DEFAULT 'standard' NOT NULL,
	"help_text" text,
	"position" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "custom_field_definitions_entity_check" CHECK (entity in ('students', 'contacts')),
	CONSTRAINT "custom_field_definitions_type_check" CHECK (type in ('text', 'long_text', 'number', 'date', 'boolean', 'select', 'multi_select')),
	CONSTRAINT "custom_field_definitions_key_check" CHECK (key ~ '^[a-z][a-z0-9_]{0,62}$'),
	CONSTRAINT "custom_field_definitions_sensitivity_check" CHECK (sensitivity in ('standard', 'restricted', 'sensitive', 'confidential'))
);
--> statement-breakpoint
CREATE TABLE "name_pronunciations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"phonetic" text,
	"audio_object_key" text,
	"language" text DEFAULT 'en' NOT NULL,
	"recorded_by_kind" text NOT NULL,
	CONSTRAINT "name_pronunciations_kind_check" CHECK (recorded_by_kind in ('staff', 'student', 'family')),
	CONSTRAINT "name_pronunciations_content_check" CHECK (phonetic is not null or audio_object_key is not null)
);
--> statement-breakpoint
CREATE TABLE "student_supports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"type" text NOT NULL,
	"details" text,
	"accommodations" text[] DEFAULT '{}'::text[] NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"source" text DEFAULT 'manual' NOT NULL,
	CONSTRAINT "student_supports_type_check" CHECK (type in ('iep', '504', 'ell', 'other')),
	CONSTRAINT "student_supports_source_check" CHECK (source in ('manual', 'import')),
	CONSTRAINT "student_supports_dates_check" CHECK (ends_on is null or ends_on >= starts_on)
);
--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "photo_object_key" text;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_codes" ADD CONSTRAINT "attendance_codes_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_codes" ADD CONSTRAINT "attendance_codes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_daily" ADD CONSTRAINT "attendance_daily_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_daily" ADD CONSTRAINT "attendance_daily_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_daily" ADD CONSTRAINT "attendance_daily_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_daily" ADD CONSTRAINT "attendance_daily_code_id_attendance_codes_id_fk" FOREIGN KEY ("code_id") REFERENCES "public"."attendance_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "behavior_events" ADD CONSTRAINT "behavior_events_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "behavior_events" ADD CONSTRAINT "behavior_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "behavior_events" ADD CONSTRAINT "behavior_events_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "behavior_events" ADD CONSTRAINT "behavior_events_type_id_behavior_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."behavior_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "behavior_events" ADD CONSTRAINT "behavior_events_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "behavior_types" ADD CONSTRAINT "behavior_types_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "behavior_types" ADD CONSTRAINT "behavior_types_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_ids" ADD CONSTRAINT "external_ids_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_ids" ADD CONSTRAINT "external_ids_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_runs" ADD CONSTRAINT "import_runs_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_runs" ADD CONSTRAINT "import_runs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slack_channel_allowlist" ADD CONSTRAINT "slack_channel_allowlist_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slack_channel_allowlist" ADD CONSTRAINT "slack_channel_allowlist_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slack_channel_allowlist" ADD CONSTRAINT "slack_channel_allowlist_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slack_installation" ADD CONSTRAINT "slack_installation_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slack_installation" ADD CONSTRAINT "slack_installation_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slack_installation" ADD CONSTRAINT "slack_installation_installed_by_users_id_fk" FOREIGN KEY ("installed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slack_messages" ADD CONSTRAINT "slack_messages_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slack_messages" ADD CONSTRAINT "slack_messages_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slack_rules" ADD CONSTRAINT "slack_rules_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slack_rules" ADD CONSTRAINT "slack_rules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slack_user_links" ADD CONSTRAINT "slack_user_links_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slack_user_links" ADD CONSTRAINT "slack_user_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slack_user_links" ADD CONSTRAINT "slack_user_links_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_field_definitions" ADD CONSTRAINT "custom_field_definitions_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_field_definitions" ADD CONSTRAINT "custom_field_definitions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "name_pronunciations" ADD CONSTRAINT "name_pronunciations_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "name_pronunciations" ADD CONSTRAINT "name_pronunciations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "name_pronunciations" ADD CONSTRAINT "name_pronunciations_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_supports" ADD CONSTRAINT "student_supports_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_supports" ADD CONSTRAINT "student_supports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_supports" ADD CONSTRAINT "student_supports_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "saved_views_owner_idx" ON "saved_views" USING btree ("owner_user_id","source");--> statement-breakpoint
CREATE INDEX "saved_views_school_source_idx" ON "saved_views" USING btree ("school_id","source","sharing");--> statement-breakpoint
CREATE INDEX "saved_views_created_by_idx" ON "saved_views" USING btree ("created_by");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_codes_code_idx" ON "attendance_codes" USING btree ("school_id","code");--> statement-breakpoint
CREATE INDEX "attendance_codes_created_by_idx" ON "attendance_codes" USING btree ("created_by");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_daily_student_date_idx" ON "attendance_daily" USING btree ("student_id","date");--> statement-breakpoint
CREATE INDEX "attendance_daily_school_date_idx" ON "attendance_daily" USING btree ("school_id","date");--> statement-breakpoint
CREATE INDEX "attendance_daily_code_idx" ON "attendance_daily" USING btree ("code_id");--> statement-breakpoint
CREATE INDEX "attendance_daily_created_by_idx" ON "attendance_daily" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "behavior_events_student_idx" ON "behavior_events" USING btree ("student_id","occurred_at");--> statement-breakpoint
CREATE INDEX "behavior_events_school_occurred_idx" ON "behavior_events" USING btree ("school_id","occurred_at");--> statement-breakpoint
CREATE INDEX "behavior_events_type_idx" ON "behavior_events" USING btree ("type_id");--> statement-breakpoint
CREATE INDEX "behavior_events_staff_idx" ON "behavior_events" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "behavior_events_created_by_idx" ON "behavior_events" USING btree ("created_by");--> statement-breakpoint
CREATE UNIQUE INDEX "behavior_types_label_idx" ON "behavior_types" USING btree ("school_id","label");--> statement-breakpoint
CREATE INDEX "behavior_types_created_by_idx" ON "behavior_types" USING btree ("created_by");--> statement-breakpoint
CREATE UNIQUE INDEX "external_ids_unique_idx" ON "external_ids" USING btree ("school_id","source","entity","external_id");--> statement-breakpoint
CREATE INDEX "external_ids_entity_idx" ON "external_ids" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "external_ids_created_by_idx" ON "external_ids" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "import_runs_school_started_idx" ON "import_runs" USING btree ("school_id","started_at");--> statement-breakpoint
CREATE INDEX "import_runs_created_by_idx" ON "import_runs" USING btree ("created_by");--> statement-breakpoint
CREATE UNIQUE INDEX "slack_channel_allowlist_channel_idx" ON "slack_channel_allowlist" USING btree ("school_id","channel_id");--> statement-breakpoint
CREATE INDEX "slack_channel_allowlist_approved_by_idx" ON "slack_channel_allowlist" USING btree ("approved_by");--> statement-breakpoint
CREATE INDEX "slack_channel_allowlist_created_by_idx" ON "slack_channel_allowlist" USING btree ("created_by");--> statement-breakpoint
CREATE UNIQUE INDEX "slack_installation_team_idx" ON "slack_installation" USING btree ("school_id","team_id");--> statement-breakpoint
CREATE INDEX "slack_installation_installed_by_idx" ON "slack_installation" USING btree ("installed_by");--> statement-breakpoint
CREATE INDEX "slack_installation_created_by_idx" ON "slack_installation" USING btree ("created_by");--> statement-breakpoint
CREATE UNIQUE INDEX "slack_messages_channel_ts_idx" ON "slack_messages" USING btree ("school_id","channel_id","ts");--> statement-breakpoint
CREATE INDEX "slack_messages_sent_idx" ON "slack_messages" USING btree ("school_id","sent_at");--> statement-breakpoint
CREATE INDEX "slack_messages_created_by_idx" ON "slack_messages" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "slack_rules_type_idx" ON "slack_rules" USING btree ("school_id","notification_type");--> statement-breakpoint
CREATE INDEX "slack_rules_created_by_idx" ON "slack_rules" USING btree ("created_by");--> statement-breakpoint
CREATE UNIQUE INDEX "slack_user_links_slack_user_idx" ON "slack_user_links" USING btree ("school_id","slack_user_id");--> statement-breakpoint
CREATE INDEX "slack_user_links_created_by_idx" ON "slack_user_links" USING btree ("created_by");--> statement-breakpoint
CREATE UNIQUE INDEX "custom_field_definitions_key_idx" ON "custom_field_definitions" USING btree ("school_id","entity","key");--> statement-breakpoint
CREATE INDEX "custom_field_definitions_created_by_idx" ON "custom_field_definitions" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "name_pronunciations_student_idx" ON "name_pronunciations" USING btree ("student_id","created_at");--> statement-breakpoint
CREATE INDEX "name_pronunciations_school_idx" ON "name_pronunciations" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "name_pronunciations_created_by_idx" ON "name_pronunciations" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "student_supports_student_idx" ON "student_supports" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "student_supports_school_type_idx" ON "student_supports" USING btree ("school_id","type");--> statement-breakpoint
CREATE INDEX "student_supports_created_by_idx" ON "student_supports" USING btree ("created_by");