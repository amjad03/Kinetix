-- Admissions: lead score, agents and commissions, interviews, online entrance test. HR: appraisal, training, offers, onboarding, exit.
ALTER TABLE "enquiries" ADD COLUMN IF NOT EXISTS "lead_score" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "enquiries" ADD COLUMN IF NOT EXISTS "agent_id" uuid;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "agent_id" uuid;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admission_agents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "name" text NOT NULL,
  "kind" text DEFAULT 'agent' NOT NULL,
  "phone" text,
  "email" text,
  "referral_code" text NOT NULL,
  "commission_paise" bigint DEFAULT 0 NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "admission_agents_code_uq" ON "admission_agents" ("tenant_id", "referral_code");--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_agent_fk" FOREIGN KEY ("agent_id") REFERENCES "admission_agents"("id") ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "applications" ADD CONSTRAINT "applications_agent_fk" FOREIGN KEY ("agent_id") REFERENCES "admission_agents"("id") ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_commissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "agent_id" uuid NOT NULL REFERENCES "admission_agents"("id"),
  "application_id" uuid NOT NULL REFERENCES "applications"("id") ON DELETE CASCADE,
  "amount_paise" bigint NOT NULL,
  "status" text DEFAULT 'accrued' NOT NULL,
  "paid_on" date,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agent_commissions_app_uq" ON "agent_commissions" ("application_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_commissions_agent_idx" ON "agent_commissions" ("agent_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admission_interviews" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "application_id" uuid NOT NULL REFERENCES "applications"("id") ON DELETE CASCADE,
  "slot_at" timestamp with time zone NOT NULL,
  "venue" text,
  "panel" jsonb DEFAULT '[]' NOT NULL,
  "status" text DEFAULT 'scheduled' NOT NULL,
  "outcome" text,
  "score" numeric(7,2),
  "max_score" numeric(7,2) DEFAULT 100 NOT NULL,
  "remarks" text,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admission_interviews_app_idx" ON "admission_interviews" ("application_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admission_interviews_slot_idx" ON "admission_interviews" ("tenant_id", "slot_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "interview_scores" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "interview_id" uuid NOT NULL REFERENCES "admission_interviews"("id") ON DELETE CASCADE,
  "panelist_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "panelist_name" text NOT NULL,
  "criteria" jsonb DEFAULT '[]' NOT NULL,
  "score" numeric(7,2) NOT NULL,
  "remarks" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "interview_scores_panelist_uq" ON "interview_scores" ("interview_id", "panelist_name");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "entrance_questions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "program_id" uuid REFERENCES "programs"("id") ON DELETE SET NULL,
  "topic" text DEFAULT 'General' NOT NULL,
  "question" text NOT NULL,
  "options" jsonb NOT NULL,
  "correct_index" integer NOT NULL,
  "marks" numeric(5,2) DEFAULT 1 NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "entrance_questions_topic_idx" ON "entrance_questions" ("tenant_id", "topic");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "entrance_online_configs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "test_id" uuid NOT NULL REFERENCES "entrance_tests"("id") ON DELETE CASCADE,
  "question_count" integer NOT NULL,
  "negative_marks" numeric(4,2) DEFAULT 0 NOT NULL,
  "topic" text,
  "open" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "entrance_online_configs_test_uq" ON "entrance_online_configs" ("test_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "entrance_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "test_id" uuid NOT NULL REFERENCES "entrance_tests"("id") ON DELETE CASCADE,
  "application_id" uuid NOT NULL REFERENCES "applications"("id") ON DELETE CASCADE,
  "question_ids" jsonb NOT NULL,
  "answers" jsonb DEFAULT '{}' NOT NULL,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deadline_at" timestamp with time zone NOT NULL,
  "submitted_at" timestamp with time zone,
  "score" numeric(7,2),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "entrance_attempts_uq" ON "entrance_attempts" ("test_id", "application_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "appraisal_cycles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "period" text NOT NULL,
  "opens_on" date NOT NULL,
  "closes_on" date NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "appraisal_cycles_period_uq" ON "appraisal_cycles" ("tenant_id", "period");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "appraisals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "cycle_id" uuid NOT NULL REFERENCES "appraisal_cycles"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "status" text DEFAULT 'draft' NOT NULL,
  "self_scores" jsonb DEFAULT '{}' NOT NULL,
  "hod_scores" jsonb DEFAULT '{}' NOT NULL,
  "hod_remarks" text,
  "hod_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "final_score" numeric(5,2),
  "grade" text,
  "principal_remarks" text,
  "principal_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "appraisals_user_uq" ON "appraisals" ("cycle_id", "user_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "training_records" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "kind" text DEFAULT 'fdp' NOT NULL,
  "organiser" text,
  "starts_on" date NOT NULL,
  "ends_on" date NOT NULL,
  "hours" numeric(6,1) DEFAULT 0 NOT NULL,
  "certificate_ref" text,
  "verified" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "training_records_user_idx" ON "training_records" ("user_id", "starts_on");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "offer_letters" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "applicant_id" uuid NOT NULL REFERENCES "job_applicants"("id") ON DELETE CASCADE,
  "offer_no" text NOT NULL,
  "position" text NOT NULL,
  "annual_ctc_paise" bigint NOT NULL,
  "joining_on" date NOT NULL,
  "valid_until" date NOT NULL,
  "terms" text DEFAULT '' NOT NULL,
  "status" text DEFAULT 'issued' NOT NULL,
  "issued_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "offer_letters_no_uq" ON "offer_letters" ("tenant_id", "offer_no");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "offer_letters_applicant_idx" ON "offer_letters" ("applicant_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "onboarding_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "owner" text DEFAULT 'HR' NOT NULL,
  "due_on" date,
  "done" boolean DEFAULT false NOT NULL,
  "done_at" timestamp with time zone,
  "done_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "onboarding_items_user_idx" ON "onboarding_items" ("user_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "separations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "resigned_on" date NOT NULL,
  "notice_days" integer DEFAULT 30 NOT NULL,
  "last_working_day" date NOT NULL,
  "reason" text NOT NULL,
  "status" text DEFAULT 'submitted' NOT NULL,
  "notice_shortfall_days" integer DEFAULT 0 NOT NULL,
  "settlement_paise" bigint,
  "settlement_note" text,
  "relieved_on" date,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "separations_user_idx" ON "separations" ("user_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "exit_clearances" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "separation_id" uuid NOT NULL REFERENCES "separations"("id") ON DELETE CASCADE,
  "department" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "dues_paise" bigint DEFAULT 0 NOT NULL,
  "remarks" text,
  "cleared_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "cleared_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "exit_clearances_uq" ON "exit_clearances" ("separation_id", "department");--> statement-breakpoint
ALTER TABLE "admission_agents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "admission_agents";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "admission_agents"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "admission_agents" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "agent_commissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "agent_commissions";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "agent_commissions"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "agent_commissions" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "admission_interviews" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "admission_interviews";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "admission_interviews"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "admission_interviews" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "interview_scores" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "interview_scores";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "interview_scores"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "interview_scores" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "entrance_questions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "entrance_questions";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "entrance_questions"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "entrance_questions" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "entrance_online_configs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "entrance_online_configs";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "entrance_online_configs"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "entrance_online_configs" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "entrance_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "entrance_attempts";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "entrance_attempts"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "entrance_attempts" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "appraisal_cycles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "appraisal_cycles";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "appraisal_cycles"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "appraisal_cycles" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "appraisals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "appraisals";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "appraisals"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "appraisals" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "training_records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "training_records";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "training_records"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "training_records" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "offer_letters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "offer_letters";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "offer_letters"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "offer_letters" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "onboarding_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "onboarding_items";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "onboarding_items"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "onboarding_items" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "separations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "separations";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "separations"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "separations" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "exit_clearances" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "exit_clearances";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "exit_clearances"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "exit_clearances" TO kinetix_app;
  END IF;
END $$;
