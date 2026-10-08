-- On-screen evaluation, invigilation roster, supplementary registration, malpractice cases, grace marks and progression rules.
CREATE TABLE IF NOT EXISTS "eval_configs" (
  "paper_id" uuid PRIMARY KEY NOT NULL REFERENCES "exam_papers"("id") ON DELETE CASCADE,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "per_examiner_cap" integer DEFAULT 50 NOT NULL,
  "second_share_percent" integer DEFAULT 20 NOT NULL,
  "threshold_marks" numeric(6,2) DEFAULT 10 NOT NULL,
  "second_picked_at" timestamp with time zone,
  "finalised_at" timestamp with time zone
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "eval_questions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "paper_id" uuid NOT NULL REFERENCES "exam_papers"("id") ON DELETE CASCADE,
  "no" text NOT NULL,
  "max_marks" numeric(6,2) NOT NULL,
  "ord" smallint DEFAULT 0 NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "eval_questions_uq" ON "eval_questions" ("paper_id", "no");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "eval_scripts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "paper_id" uuid NOT NULL REFERENCES "exam_papers"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id"),
  "dummy_no" text NOT NULL,
  "files" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "status" text DEFAULT 'uploaded' NOT NULL,
  "second_required" boolean DEFAULT false NOT NULL,
  "third_required" boolean DEFAULT false NOT NULL,
  "final_marks" numeric(6,2),
  "uploaded_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "eval_scripts_student_uq" ON "eval_scripts" ("paper_id", "student_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "eval_scripts_dummy_uq" ON "eval_scripts" ("paper_id", "dummy_no");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "eval_allocations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "script_id" uuid NOT NULL REFERENCES "eval_scripts"("id") ON DELETE CASCADE,
  "paper_id" uuid NOT NULL REFERENCES "exam_papers"("id") ON DELETE CASCADE,
  "examiner_id" uuid NOT NULL REFERENCES "users"("id"),
  "round" smallint NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "total" numeric(6,2),
  "submitted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "eval_alloc_round_uq" ON "eval_allocations" ("script_id", "round");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "eval_alloc_examiner_uq" ON "eval_allocations" ("script_id", "examiner_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "eval_alloc_examiner_idx" ON "eval_allocations" ("examiner_id", "status");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "eval_marks" (
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "allocation_id" uuid NOT NULL REFERENCES "eval_allocations"("id") ON DELETE CASCADE,
  "question_id" uuid NOT NULL REFERENCES "eval_questions"("id") ON DELETE CASCADE,
  "marks" numeric(6,2) NOT NULL,
  "comment" text,
  PRIMARY KEY ("allocation_id", "question_id")
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invigilation_duties" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "session_id" uuid NOT NULL REFERENCES "exam_sessions"("id") ON DELETE CASCADE,
  "staff_id" uuid NOT NULL REFERENCES "users"("id"),
  "room_id" uuid NOT NULL REFERENCES "rooms"("id"),
  "duty_date" date NOT NULL,
  "starts_at" time NOT NULL,
  "ends_at" time NOT NULL,
  "role" text DEFAULT 'invigilator' NOT NULL,
  "status" text DEFAULT 'assigned' NOT NULL,
  "substituted_from" uuid REFERENCES "users"("id"),
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invigilation_staff_idx" ON "invigilation_duties" ("staff_id", "duty_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invigilation_session_idx" ON "invigilation_duties" ("session_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "supplementary_registrations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "session_id" uuid NOT NULL REFERENCES "exam_sessions"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id"),
  "subject_id" uuid NOT NULL REFERENCES "subjects"("id"),
  "failed_in_session_id" uuid NOT NULL REFERENCES "exam_sessions"("id"),
  "registered_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "supplementary_reg_uq" ON "supplementary_registrations" ("session_id", "student_id", "subject_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "malpractice_cases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "session_id" uuid NOT NULL REFERENCES "exam_sessions"("id") ON DELETE CASCADE,
  "paper_id" uuid REFERENCES "exam_papers"("id") ON DELETE SET NULL,
  "student_id" uuid NOT NULL REFERENCES "students"("id"),
  "room_id" uuid REFERENCES "rooms"("id") ON DELETE SET NULL,
  "description" text NOT NULL,
  "reported_by" uuid NOT NULL REFERENCES "users"("id"),
  "status" text DEFAULT 'reported' NOT NULL,
  "penalty" text,
  "decision_note" text,
  "decided_by" uuid REFERENCES "users"("id"),
  "decided_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "malpractice_session_idx" ON "malpractice_cases" ("session_id", "status");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "exam_result_rules" (
  "session_id" uuid PRIMARY KEY NOT NULL REFERENCES "exam_sessions"("id") ON DELETE CASCADE,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "grace_max_per_subject" numeric(5,2) DEFAULT 0 NOT NULL,
  "grace_max_total" numeric(5,2) DEFAULT 0 NOT NULL,
  "progression_min_credits" numeric(6,1),
  "progression_max_backlogs" integer
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "grace_awards" (
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "session_id" uuid NOT NULL REFERENCES "exam_sessions"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id"),
  "subject_id" uuid NOT NULL REFERENCES "subjects"("id"),
  "marks" numeric(5,2) NOT NULL,
  "applied_by" uuid NOT NULL REFERENCES "users"("id"),
  "applied_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY ("session_id", "student_id", "subject_id")
);--> statement-breakpoint
ALTER TABLE "eval_configs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "eval_configs";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "eval_configs"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "eval_configs" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "eval_questions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "eval_questions";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "eval_questions"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "eval_questions" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "eval_scripts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "eval_scripts";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "eval_scripts"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "eval_scripts" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "eval_allocations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "eval_allocations";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "eval_allocations"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "eval_allocations" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "eval_marks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "eval_marks";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "eval_marks"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "eval_marks" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "invigilation_duties" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "invigilation_duties";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "invigilation_duties"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "invigilation_duties" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "supplementary_registrations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "supplementary_registrations";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "supplementary_registrations"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "supplementary_registrations" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "malpractice_cases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "malpractice_cases";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "malpractice_cases"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "malpractice_cases" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "exam_result_rules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "exam_result_rules";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "exam_result_rules"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "exam_result_rules" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "grace_awards" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "grace_awards";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "grace_awards"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "grace_awards" TO kinetix_app;
  END IF;
END $$;
