CREATE TABLE "placement_companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"name" text NOT NULL,
	"sector" text DEFAULT '' NOT NULL,
	"website" text,
	"contact_name" text,
	"contact_email" text,
	"contact_phone" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "placement_companies_status_ck" CHECK (status IN ('active', 'blacklisted'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "placement_companies_name_uq" ON "placement_companies" USING btree ("tenant_id", lower("name"));--> statement-breakpoint
CREATE TABLE "placement_drives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"company_id" uuid NOT NULL REFERENCES "placement_companies"("id"),
	"title" text NOT NULL,
	"kind" text DEFAULT 'placement' NOT NULL,
	"role_title" text NOT NULL,
	"ctc_lpa" numeric(6, 2),
	"stipend_monthly" integer,
	"location" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"drive_date" date,
	"registration_closes_on" date,
	"min_cgpa" numeric(4, 2) DEFAULT 0 NOT NULL,
	"max_backlogs" smallint DEFAULT 0 NOT NULL,
	"program_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid REFERENCES "users"("id") ON DELETE set null,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "placement_drives_kind_ck" CHECK (kind IN ('placement', 'internship')),
	CONSTRAINT "placement_drives_status_ck" CHECK (status IN ('draft', 'open', 'closed', 'completed', 'cancelled'))
);
--> statement-breakpoint
CREATE INDEX "placement_drives_status_idx" ON "placement_drives" USING btree ("tenant_id", "status");--> statement-breakpoint
CREATE TABLE "drive_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"drive_id" uuid NOT NULL REFERENCES "placement_drives"("id") ON DELETE cascade,
	"student_id" uuid NOT NULL REFERENCES "students"("id"),
	"status" text DEFAULT 'registered' NOT NULL,
	"cgpa_at" numeric(4, 2) NOT NULL,
	"backlogs_at" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drive_registrations_status_ck" CHECK (status IN ('registered', 'shortlisted', 'rejected', 'selected', 'withdrawn'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "drive_registrations_uq" ON "drive_registrations" USING btree ("drive_id", "student_id");--> statement-breakpoint
CREATE INDEX "drive_registrations_student_idx" ON "drive_registrations" USING btree ("student_id");--> statement-breakpoint
CREATE TABLE "drive_rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"drive_id" uuid NOT NULL REFERENCES "placement_drives"("id") ON DELETE cascade,
	"seq" smallint NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'interview' NOT NULL,
	"scheduled_on" date,
	CONSTRAINT "drive_rounds_kind_ck" CHECK (kind IN ('aptitude', 'technical', 'gd', 'interview', 'hr'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "drive_rounds_seq_uq" ON "drive_rounds" USING btree ("drive_id", "seq");--> statement-breakpoint
CREATE TABLE "round_results" (
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"round_id" uuid NOT NULL REFERENCES "drive_rounds"("id") ON DELETE cascade,
	"registration_id" uuid NOT NULL REFERENCES "drive_registrations"("id") ON DELETE cascade,
	"result" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "round_results_round_id_registration_id_pk" PRIMARY KEY("round_id", "registration_id"),
	CONSTRAINT "round_results_result_ck" CHECK (result IN ('pass', 'fail', 'absent'))
);
--> statement-breakpoint
CREATE TABLE "placement_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"drive_id" uuid NOT NULL REFERENCES "placement_drives"("id") ON DELETE cascade,
	"registration_id" uuid NOT NULL REFERENCES "drive_registrations"("id") ON DELETE cascade,
	"student_id" uuid NOT NULL REFERENCES "students"("id"),
	"role_title" text NOT NULL,
	"ctc_lpa" numeric(6, 2),
	"status" text DEFAULT 'offered' NOT NULL,
	"offered_on" date NOT NULL,
	"respond_by" date,
	"responded_at" timestamp with time zone,
	"decline_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "placement_offers_status_ck" CHECK (status IN ('offered', 'accepted', 'declined', 'withdrawn', 'expired'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "placement_offers_registration_uq" ON "placement_offers" USING btree ("registration_id");--> statement-breakpoint
CREATE UNIQUE INDEX "placement_offers_one_accepted_uq" ON "placement_offers" USING btree ("student_id") WHERE status = 'accepted';
