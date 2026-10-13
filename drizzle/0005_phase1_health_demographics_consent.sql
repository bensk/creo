CREATE TABLE "student_demographics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"gender" text,
	"ethnicity" text[] DEFAULT '{}'::text[] NOT NULL,
	"home_address" text,
	"meal_form_status" text,
	"source" text DEFAULT 'manual' NOT NULL,
	CONSTRAINT "student_demographics_student_id_unique" UNIQUE("student_id"),
	CONSTRAINT "student_demographics_gender_check" CHECK (gender is null or gender in ('F', 'M', 'X')),
	CONSTRAINT "student_demographics_meal_form_check" CHECK (meal_form_status is null or meal_form_status in ('received', 'missing')),
	CONSTRAINT "student_demographics_source_check" CHECK (source in ('manual', 'import'))
);
--> statement-breakpoint
CREATE TABLE "student_health" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"has_allergies" boolean,
	"allergy_details" text,
	"epipen" boolean DEFAULT false NOT NULL,
	"allergy_medication" boolean DEFAULT false NOT NULL,
	"food_restrictions" boolean,
	"lunch_accommodations" text[] DEFAULT '{}'::text[] NOT NULL,
	"allergy_form" text,
	"asthma_form" text,
	"general_form" text,
	"immunization_status" text,
	"immunization_date" date,
	"physical_status" text,
	"physical_date" date,
	"source" text DEFAULT 'manual' NOT NULL,
	CONSTRAINT "student_health_student_id_unique" UNIQUE("student_id"),
	CONSTRAINT "student_health_allergy_form_check" CHECK (allergy_form is null or allergy_form in ('received', 'missing', 'not_needed')),
	CONSTRAINT "student_health_asthma_form_check" CHECK (asthma_form is null or asthma_form in ('received', 'missing', 'not_needed')),
	CONSTRAINT "student_health_general_form_check" CHECK (general_form is null or general_form in ('received', 'missing', 'not_needed')),
	CONSTRAINT "student_health_immunization_check" CHECK (immunization_status is null or immunization_status in ('received', 'appointment_scheduled', 'missing')),
	CONSTRAINT "student_health_physical_check" CHECK (physical_status is null or physical_status in ('received', 'appointment_scheduled', 'missing')),
	CONSTRAINT "student_health_source_check" CHECK (source in ('manual', 'import'))
);
--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "media_consent" text;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "medical_alert" text;--> statement-breakpoint
ALTER TABLE "student_demographics" ADD CONSTRAINT "student_demographics_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_demographics" ADD CONSTRAINT "student_demographics_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_demographics" ADD CONSTRAINT "student_demographics_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_health" ADD CONSTRAINT "student_health_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_health" ADD CONSTRAINT "student_health_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_health" ADD CONSTRAINT "student_health_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "student_demographics_school_idx" ON "student_demographics" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "student_demographics_created_by_idx" ON "student_demographics" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "student_health_school_idx" ON "student_health" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "student_health_created_by_idx" ON "student_health" USING btree ("created_by");--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_media_consent_check" CHECK (media_consent is null or media_consent in ('yes', 'no', 'ask_first'));