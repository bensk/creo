CREATE TABLE "school_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"school_year_id" uuid NOT NULL,
	"date" date NOT NULL,
	"is_instructional" boolean DEFAULT true NOT NULL,
	"day_type" text DEFAULT 'full' NOT NULL,
	"note" text,
	CONSTRAINT "school_days_type_check" CHECK (day_type in ('full', 'half', 'other'))
);
--> statement-breakpoint
ALTER TABLE "attendance_daily" ADD COLUMN "arrived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "school_days" ADD CONSTRAINT "school_days_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_days" ADD CONSTRAINT "school_days_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_days" ADD CONSTRAINT "school_days_school_year_id_school_years_id_fk" FOREIGN KEY ("school_year_id") REFERENCES "public"."school_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "school_days_date_idx" ON "school_days" USING btree ("school_id","date");--> statement-breakpoint
CREATE INDEX "school_days_year_idx" ON "school_days" USING btree ("school_year_id");--> statement-breakpoint
CREATE INDEX "school_days_created_by_idx" ON "school_days" USING btree ("created_by");