-- Placements depth: company groups, contacts and the recruiter portal key; drive category (dream offers), batches and
-- registration window; placement opt-in and debarment; interview slots; offer letters, revocation, joining and
-- conditional offers; placement training; internship credits; higher-studies and entrepreneurship progression;
-- alumni verification and job posts; employer and alumni feedback.
ALTER TABLE "placement_companies" DROP CONSTRAINT IF EXISTS "placement_companies_status_ck";--> statement-breakpoint
ALTER TABLE "placement_companies" ADD CONSTRAINT "placement_companies_status_ck" CHECK (status IN ('active', 'blacklisted', 'pending'));--> statement-breakpoint
ALTER TABLE "placement_offers" DROP CONSTRAINT IF EXISTS "placement_offers_status_ck";--> statement-breakpoint
ALTER TABLE "placement_offers" ADD CONSTRAINT "placement_offers_status_ck" CHECK (status IN ('offered', 'accepted', 'declined', 'withdrawn', 'expired', 'revoked'));--> statement-breakpoint
ALTER TABLE "placement_companies" ADD COLUMN IF NOT EXISTS "group_name" text;--> statement-breakpoint
ALTER TABLE "placement_companies" ADD COLUMN IF NOT EXISTS "city" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "placement_companies" ADD COLUMN IF NOT EXISTS "address" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "placement_companies" ADD COLUMN IF NOT EXISTS "description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "placement_companies" ADD COLUMN IF NOT EXISTS "self_registered" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "placement_companies" ADD COLUMN IF NOT EXISTS "portal_token_hash" text;--> statement-breakpoint
ALTER TABLE "placement_companies" ADD COLUMN IF NOT EXISTS "portal_token_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "placement_companies_token_uq" ON "placement_companies" ("portal_token_hash") WHERE "portal_token_hash" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "placement_drives" ADD COLUMN IF NOT EXISTS "category" text DEFAULT 'regular' NOT NULL;--> statement-breakpoint
ALTER TABLE "placement_drives" ADD COLUMN IF NOT EXISTS "batch_years" smallint[] DEFAULT '{}'::smallint[] NOT NULL;--> statement-breakpoint
ALTER TABLE "placement_drives" ADD COLUMN IF NOT EXISTS "registration_opens_on" date;--> statement-breakpoint
ALTER TABLE "placement_drives" ADD COLUMN IF NOT EXISTS "venue" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "placement_drives" ADD COLUMN IF NOT EXISTS "skills" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "placement_drives" ADD COLUMN IF NOT EXISTS "bond" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "placement_drives" ADD COLUMN IF NOT EXISTS "posted_by_recruiter" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "placement_offers" ADD COLUMN IF NOT EXISTS "offer_letter_key" text;--> statement-breakpoint
ALTER TABLE "placement_offers" ADD COLUMN IF NOT EXISTS "offer_letter_name" text;--> statement-breakpoint
ALTER TABLE "placement_offers" ADD COLUMN IF NOT EXISTS "revoked_reason" text;--> statement-breakpoint
ALTER TABLE "placement_offers" ADD COLUMN IF NOT EXISTS "revoked_on" date;--> statement-breakpoint
ALTER TABLE "placement_offers" ADD COLUMN IF NOT EXISTS "joining_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "placement_offers" ADD COLUMN IF NOT EXISTS "joined_on" date;--> statement-breakpoint
ALTER TABLE "placement_offers" ADD COLUMN IF NOT EXISTS "joining_note" text;--> statement-breakpoint
ALTER TABLE "placement_offers" ADD COLUMN IF NOT EXISTS "conditional" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "placement_offers" ADD COLUMN IF NOT EXISTS "condition_note" text;--> statement-breakpoint
ALTER TABLE "placement_offers" ADD COLUMN IF NOT EXISTS "responded_via" text;--> statement-breakpoint
ALTER TABLE "internships" ADD COLUMN IF NOT EXISTS "credits" numeric(4, 1);--> statement-breakpoint
ALTER TABLE "internships" ADD COLUMN IF NOT EXISTS "credit_subject_id" uuid REFERENCES "subjects"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "internships" ADD COLUMN IF NOT EXISTS "company_confirmed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "internships" ADD COLUMN IF NOT EXISTS "supervisor_rating" smallint;--> statement-breakpoint
ALTER TABLE "internships" ADD COLUMN IF NOT EXISTS "applied_on" date;--> statement-breakpoint
ALTER TABLE "alumni_profiles" ADD COLUMN IF NOT EXISTS "verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "alumni_profiles" ADD COLUMN IF NOT EXISTS "verified_by" uuid REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "alumni_profiles" ADD COLUMN IF NOT EXISTS "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "alumni_profiles" ADD COLUMN IF NOT EXISTS "linkedin" text;--> statement-breakpoint
UPDATE "alumni_profiles" SET "verified" = true WHERE "student_id" IS NOT NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "placement_company_contacts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "company_id" uuid NOT NULL REFERENCES "placement_companies"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "designation" text DEFAULT '' NOT NULL,
  "email" text,
  "phone" text,
  "is_primary" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "placement_company_contacts_company_idx" ON "placement_company_contacts" ("company_id");--> statement-breakpoint
ALTER TABLE "placement_company_contacts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "placement_company_contacts";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "placement_company_contacts"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "placement_company_contacts" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "placement_optins" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "opted_in" boolean DEFAULT true NOT NULL,
  "reason" text,
  "debarred_until" date,
  "debar_reason" text,
  "updated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "placement_optins_student_uq" ON "placement_optins" ("student_id");--> statement-breakpoint
ALTER TABLE "placement_optins" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "placement_optins";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "placement_optins"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "placement_optins" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "interview_slots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "drive_id" uuid NOT NULL REFERENCES "placement_drives"("id") ON DELETE CASCADE,
  "round_id" uuid NOT NULL REFERENCES "drive_rounds"("id") ON DELETE CASCADE,
  "registration_id" uuid NOT NULL REFERENCES "drive_registrations"("id") ON DELETE CASCADE,
  "starts_at" timestamp with time zone NOT NULL,
  "ends_at" timestamp with time zone NOT NULL,
  "venue" text DEFAULT '' NOT NULL,
  "room_id" uuid REFERENCES "rooms"("id") ON DELETE SET NULL,
  "panel" text DEFAULT '' NOT NULL,
  "status" text DEFAULT 'scheduled' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "interview_slots_round_reg_uq" ON "interview_slots" ("round_id", "registration_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "interview_slots_drive_idx" ON "interview_slots" ("drive_id", "starts_at");--> statement-breakpoint
ALTER TABLE "interview_slots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "interview_slots";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "interview_slots"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "interview_slots" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "placement_trainings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "kind" text DEFAULT 'aptitude' NOT NULL,
  "trainer" text DEFAULT '' NOT NULL,
  "program_id" uuid REFERENCES "programs"("id") ON DELETE SET NULL,
  "batch_year" smallint,
  "starts_on" date NOT NULL,
  "ends_on" date NOT NULL,
  "hours" numeric(6, 1) DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'planned' NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "placement_trainings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "placement_trainings";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "placement_trainings"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "placement_trainings" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "placement_training_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "training_id" uuid NOT NULL REFERENCES "placement_trainings"("id") ON DELETE CASCADE,
  "held_on" date NOT NULL,
  "topic" text NOT NULL,
  "hours" numeric(4, 1) DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "placement_training_sessions_training_idx" ON "placement_training_sessions" ("training_id", "held_on");--> statement-breakpoint
ALTER TABLE "placement_training_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "placement_training_sessions";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "placement_training_sessions"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "placement_training_sessions" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "placement_training_attendance" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "session_id" uuid NOT NULL REFERENCES "placement_training_sessions"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "present" boolean NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "placement_training_attendance_uq" ON "placement_training_attendance" ("session_id", "student_id");--> statement-breakpoint
ALTER TABLE "placement_training_attendance" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "placement_training_attendance";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "placement_training_attendance"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "placement_training_attendance" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "placement_training_scores" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "training_id" uuid NOT NULL REFERENCES "placement_trainings"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "test_name" text NOT NULL,
  "score" numeric(6, 2) NOT NULL,
  "max_score" numeric(6, 2) NOT NULL,
  "taken_on" date,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "placement_training_scores_uq" ON "placement_training_scores" ("training_id", "student_id", "test_name");--> statement-breakpoint
ALTER TABLE "placement_training_scores" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "placement_training_scores";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "placement_training_scores"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "placement_training_scores" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "student_progressions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "year" smallint NOT NULL,
  "institution" text DEFAULT '' NOT NULL,
  "program" text DEFAULT '' NOT NULL,
  "country" text DEFAULT 'India' NOT NULL,
  "exam" text DEFAULT '' NOT NULL,
  "exam_ref" text DEFAULT '' NOT NULL,
  "venture_name" text DEFAULT '' NOT NULL,
  "venture_detail" text DEFAULT '' NOT NULL,
  "verified" boolean DEFAULT false NOT NULL,
  "note" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "student_progressions_year_idx" ON "student_progressions" ("tenant_id", "year");--> statement-breakpoint
ALTER TABLE "student_progressions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "student_progressions";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "student_progressions"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "student_progressions" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "alumni_job_posts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "company" text NOT NULL,
  "location" text DEFAULT '' NOT NULL,
  "kind" text DEFAULT 'job' NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "apply_contact" text DEFAULT '' NOT NULL,
  "closes_on" date,
  "alumni_id" uuid REFERENCES "alumni_profiles"("id") ON DELETE SET NULL,
  "posted_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alumni_job_posts_status_idx" ON "alumni_job_posts" ("tenant_id", "status");--> statement-breakpoint
ALTER TABLE "alumni_job_posts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "alumni_job_posts";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "alumni_job_posts"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "alumni_job_posts" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "placement_feedback" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "company_id" uuid REFERENCES "placement_companies"("id") ON DELETE SET NULL,
  "alumni_id" uuid REFERENCES "alumni_profiles"("id") ON DELETE SET NULL,
  "respondent_name" text NOT NULL,
  "respondent_org" text DEFAULT '' NOT NULL,
  "respondent_email" text,
  "year" smallint NOT NULL,
  "r1" smallint NOT NULL,
  "r2" smallint NOT NULL,
  "r3" smallint NOT NULL,
  "r4" smallint NOT NULL,
  "r5" smallint NOT NULL,
  "overall" smallint NOT NULL,
  "comments" text DEFAULT '' NOT NULL,
  "source" text DEFAULT 'office' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "placement_feedback_kind_idx" ON "placement_feedback" ("tenant_id", "kind", "year");--> statement-breakpoint
ALTER TABLE "placement_feedback" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "placement_feedback";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "placement_feedback"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "placement_feedback" TO kinetix_app;
  END IF;
END $$;
