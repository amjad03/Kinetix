CREATE TABLE "research_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"title" text NOT NULL,
	"abstract" text DEFAULT '' NOT NULL,
	"kind" text DEFAULT 'research' NOT NULL,
	"pi_user_id" uuid NOT NULL REFERENCES "users"("id"),
	"department_id" uuid REFERENCES "departments"("id") ON DELETE set null,
	"sponsor_org" text,
	"funding_sought_paise" bigint DEFAULT 0 NOT NULL,
	"ethics_required" boolean DEFAULT false NOT NULL,
	"ethics_status" text DEFAULT 'not_required' NOT NULL,
	"ethics_ref" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"review_note" text,
	"decided_by" uuid REFERENCES "users"("id") ON DELETE set null,
	"decided_at" timestamp with time zone,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "research_proposals_kind_ck" CHECK (kind IN ('research', 'capstone', 'industry')),
	CONSTRAINT "research_proposals_status_ck" CHECK (status IN ('draft', 'submitted', 'under_review', 'approved', 'rejected', 'withdrawn')),
	CONSTRAINT "research_proposals_ethics_ck" CHECK (ethics_status IN ('not_required', 'pending', 'cleared', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "research_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"proposal_id" uuid REFERENCES "research_proposals"("id") ON DELETE set null,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"kind" text DEFAULT 'research' NOT NULL,
	"pi_user_id" uuid NOT NULL REFERENCES "users"("id"),
	"department_id" uuid REFERENCES "departments"("id") ON DELETE set null,
	"sponsor_org" text,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"status" text DEFAULT 'active' NOT NULL,
	"outcome_summary" text,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "research_projects_kind_ck" CHECK (kind IN ('research', 'capstone', 'industry')),
	CONSTRAINT "research_projects_status_ck" CHECK (status IN ('active', 'on_hold', 'completed', 'cancelled')),
	CONSTRAINT "research_projects_dates_ck" CHECK (ends_on IS NULL OR ends_on >= starts_on)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "research_projects_code_uq" ON "research_projects" USING btree ("tenant_id", "code");--> statement-breakpoint
CREATE UNIQUE INDEX "research_projects_proposal_uq" ON "research_projects" USING btree ("proposal_id") WHERE proposal_id IS NOT NULL;--> statement-breakpoint
CREATE TABLE "project_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"project_id" uuid NOT NULL REFERENCES "research_projects"("id") ON DELETE cascade,
	"user_id" uuid REFERENCES "users"("id") ON DELETE cascade,
	"student_id" uuid REFERENCES "students"("id") ON DELETE cascade,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_members_role_ck" CHECK (role IN ('supervisor', 'co_supervisor', 'member', 'student')),
	CONSTRAINT "project_members_who_ck" CHECK ((user_id IS NOT NULL) <> (student_id IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "project_members_user_uq" ON "project_members" USING btree ("project_id", "user_id") WHERE user_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "project_members_student_uq" ON "project_members" USING btree ("project_id", "student_id") WHERE student_id IS NOT NULL;--> statement-breakpoint
CREATE TABLE "project_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"project_id" uuid NOT NULL REFERENCES "research_projects"("id") ON DELETE cascade,
	"title" text NOT NULL,
	"due_on" date NOT NULL,
	"completed_on" date,
	"evidence_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_scholars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"student_id" uuid REFERENCES "students"("id") ON DELETE set null,
	"full_name" text NOT NULL,
	"programme" text NOT NULL,
	"supervisor_user_id" uuid NOT NULL REFERENCES "users"("id"),
	"project_id" uuid REFERENCES "research_projects"("id") ON DELETE set null,
	"enrolled_on" date NOT NULL,
	"thesis_title" text,
	"status" text DEFAULT 'enrolled' NOT NULL,
	"completed_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "research_scholars_programme_ck" CHECK (programme IN ('phd', 'mphil')),
	CONSTRAINT "research_scholars_status_ck" CHECK (status IN ('enrolled', 'thesis_submitted', 'awarded', 'withdrawn'))
);
--> statement-breakpoint
CREATE TABLE "publications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"project_id" uuid REFERENCES "research_projects"("id") ON DELETE set null,
	"owner_user_id" uuid NOT NULL REFERENCES "users"("id"),
	"title" text NOT NULL,
	"kind" text DEFAULT 'journal' NOT NULL,
	"venue" text NOT NULL,
	"year" smallint NOT NULL,
	"doi" text,
	"issn" text,
	"indexed_in" text[] DEFAULT '{}'::text[] NOT NULL,
	"authors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "publications_kind_ck" CHECK (kind IN ('journal', 'conference', 'book', 'book_chapter'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "publications_doi_uq" ON "publications" USING btree ("tenant_id", lower("doi")) WHERE doi IS NOT NULL;--> statement-breakpoint
CREATE TABLE "research_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"project_id" uuid NOT NULL REFERENCES "research_projects"("id") ON DELETE cascade,
	"agency" text NOT NULL,
	"scheme" text DEFAULT '' NOT NULL,
	"sanction_ref" text,
	"sanctioned_paise" bigint NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "research_grants_amount_ck" CHECK (sanctioned_paise > 0),
	CONSTRAINT "research_grants_status_ck" CHECK (status IN ('active', 'closed', 'cancelled')),
	CONSTRAINT "research_grants_dates_ck" CHECK (ends_on >= starts_on)
);
--> statement-breakpoint
CREATE TABLE "grant_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"grant_id" uuid NOT NULL REFERENCES "research_grants"("id") ON DELETE cascade,
	"head" text NOT NULL,
	"amount_paise" bigint NOT NULL,
	"spent_on" date NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"voucher_ref" text,
	"created_by" uuid REFERENCES "users"("id") ON DELETE set null,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grant_expenses_amount_ck" CHECK (amount_paise > 0)
);
--> statement-breakpoint
CREATE TABLE "conferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"level" text DEFAULT 'national' NOT NULL,
	"held_on" date NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"user_id" uuid NOT NULL REFERENCES "users"("id"),
	"paper_title" text,
	"publication_id" uuid REFERENCES "publications"("id") ON DELETE set null,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conferences_role_ck" CHECK (role IN ('attended', 'presented', 'organised')),
	CONSTRAINT "conferences_level_ck" CHECK (level IN ('institutional', 'national', 'international'))
);
--> statement-breakpoint
CREATE TABLE "patents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"project_id" uuid REFERENCES "research_projects"("id") ON DELETE set null,
	"owner_user_id" uuid NOT NULL REFERENCES "users"("id"),
	"title" text NOT NULL,
	"kind" text DEFAULT 'patent' NOT NULL,
	"inventors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"application_no" text,
	"filed_on" date,
	"status" text DEFAULT 'filed' NOT NULL,
	"granted_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "patents_kind_ck" CHECK (kind IN ('patent', 'copyright', 'design', 'trademark')),
	CONSTRAINT "patents_status_ck" CHECK (status IN ('draft', 'filed', 'published', 'granted', 'rejected'))
);
