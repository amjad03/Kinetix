CREATE TABLE "internships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"student_id" uuid NOT NULL REFERENCES "students"("id"),
	"company_id" uuid REFERENCES "placement_companies"("id") ON DELETE set null,
	"org_name" text NOT NULL,
	"title" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"stipend_monthly" integer,
	"mentor_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
	"industry_mentor" text,
	"status" text DEFAULT 'proposed' NOT NULL,
	"evaluation_score" numeric(5, 2),
	"evaluation_remarks" text,
	"evaluated_by" uuid REFERENCES "users"("id") ON DELETE set null,
	"employer_feedback" text,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "internships_status_ck" CHECK (status IN ('proposed', 'approved', 'ongoing', 'completed', 'cancelled')),
	CONSTRAINT "internships_dates_ck" CHECK (ends_on >= starts_on),
	CONSTRAINT "internships_score_ck" CHECK (evaluation_score IS NULL OR (evaluation_score >= 0 AND evaluation_score <= 100))
);
--> statement-breakpoint
CREATE INDEX "internships_student_idx" ON "internships" USING btree ("student_id");--> statement-breakpoint
CREATE TABLE "internship_diary" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"internship_id" uuid NOT NULL REFERENCES "internships"("id") ON DELETE cascade,
	"entry_date" date NOT NULL,
	"entry" text NOT NULL,
	"evidence_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "internship_diary_day_uq" ON "internship_diary" USING btree ("internship_id", "entry_date");--> statement-breakpoint
CREATE TABLE "alumni_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"student_id" uuid REFERENCES "students"("id") ON DELETE set null,
	"full_name" text NOT NULL,
	"graduation_year" smallint NOT NULL,
	"program" text DEFAULT '' NOT NULL,
	"email" text,
	"phone" text,
	"employer" text,
	"designation" text,
	"city" text,
	"bio" text DEFAULT '' NOT NULL,
	"directory_visible" boolean DEFAULT false NOT NULL,
	"mentor_available" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "alumni_profiles_student_uq" ON "alumni_profiles" USING btree ("student_id") WHERE student_id IS NOT NULL;--> statement-breakpoint
CREATE TABLE "alumni_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"title" text NOT NULL,
	"starts_on" date NOT NULL,
	"venue" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"created_by" uuid REFERENCES "users"("id") ON DELETE set null,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alumni_events_status_ck" CHECK (status IN ('scheduled', 'completed', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "alumni_event_rsvps" (
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"event_id" uuid NOT NULL REFERENCES "alumni_events"("id") ON DELETE cascade,
	"alumni_id" uuid NOT NULL REFERENCES "alumni_profiles"("id") ON DELETE cascade,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alumni_event_rsvps_event_id_alumni_id_pk" PRIMARY KEY("event_id", "alumni_id")
);
--> statement-breakpoint
CREATE TABLE "mentoring_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"student_id" uuid NOT NULL REFERENCES "students"("id"),
	"alumni_id" uuid NOT NULL REFERENCES "alumni_profiles"("id") ON DELETE cascade,
	"topic" text NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mentoring_requests_status_ck" CHECK (status IN ('pending', 'accepted', 'declined', 'completed'))
);
