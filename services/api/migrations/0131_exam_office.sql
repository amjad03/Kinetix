-- Exam office (0131): session workflow stages, paper attendance, exam fees, moderation and module settings;
-- question papers gain a code, version and secure release; revaluation requests gain a kind and a fee.
ALTER TABLE "ext_question_papers" ADD COLUMN IF NOT EXISTS "code" text;--> statement-breakpoint
ALTER TABLE "ext_question_papers" ADD COLUMN IF NOT EXISTS "version" integer NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE "ext_question_papers" ADD COLUMN IF NOT EXISTS "submitted_at" timestamptz;--> statement-breakpoint
ALTER TABLE "ext_question_papers" ADD COLUMN IF NOT EXISTS "approved_by" uuid REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "ext_question_papers" ADD COLUMN IF NOT EXISTS "approved_at" timestamptz;--> statement-breakpoint
ALTER TABLE "ext_question_papers" ADD COLUMN IF NOT EXISTS "locked_at" timestamptz;--> statement-breakpoint
ALTER TABLE "ext_question_papers" ADD COLUMN IF NOT EXISTS "content_hash" text;--> statement-breakpoint
ALTER TABLE "ext_question_papers" ADD COLUMN IF NOT EXISTS "release_at" timestamptz;--> statement-breakpoint
ALTER TABLE "ext_question_papers" ADD COLUMN IF NOT EXISTS "released_by" uuid REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "ext_question_papers" ADD COLUMN IF NOT EXISTS "released_at" timestamptz;--> statement-breakpoint
ALTER TABLE "revaluation_requests" ADD COLUMN IF NOT EXISTS "kind" text NOT NULL DEFAULT 'revaluation';--> statement-breakpoint
ALTER TABLE "revaluation_requests" ADD COLUMN IF NOT EXISTS "fee_paise" bigint NOT NULL DEFAULT 0;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "exam_session_stages" (
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "session_id" uuid NOT NULL REFERENCES "exam_sessions"("id") ON DELETE CASCADE,
  "stage" text NOT NULL,
  "status" text NOT NULL,
  "actor_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "note" text,
  "at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("session_id", "stage")
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "exam_attendance" (
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "paper_id" uuid NOT NULL REFERENCES "exam_papers"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id"),
  "status" text NOT NULL DEFAULT 'present',
  "booklet_no" text,
  "marked_by" uuid NOT NULL REFERENCES "users"("id"),
  "marked_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("paper_id", "student_id")
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "exam_fee_dues" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "session_id" uuid NOT NULL REFERENCES "exam_sessions"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id"),
  "papers" integer NOT NULL DEFAULT 0,
  "amount_paise" bigint NOT NULL,
  "status" text NOT NULL DEFAULT 'due',
  "receipt_no" text,
  "note" text,
  "settled_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "settled_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "exam_moderations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "session_id" uuid NOT NULL REFERENCES "exam_sessions"("id") ON DELETE CASCADE,
  "paper_id" uuid NOT NULL REFERENCES "exam_papers"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "value" numeric(6,2) NOT NULL,
  "reason" text NOT NULL,
  "status" text NOT NULL DEFAULT 'proposed',
  "proposed_by" uuid NOT NULL REFERENCES "users"("id"),
  "decided_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "decided_at" timestamptz,
  "decision_note" text,
  "applied_count" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "exam_office_settings" (
  "tenant_id" uuid PRIMARY KEY REFERENCES "tenants"("id") ON DELETE CASCADE,
  "settings" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "updated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "exam_fee_dues_uq" ON "exam_fee_dues" ("session_id", "student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exam_moderations_session_idx" ON "exam_moderations" ("session_id", "status");--> statement-breakpoint
ALTER TABLE "exam_session_stages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "exam_session_stages";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "exam_session_stages"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "exam_session_stages" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "exam_attendance" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "exam_attendance";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "exam_attendance"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "exam_attendance" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "exam_fee_dues" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "exam_fee_dues";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "exam_fee_dues"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "exam_fee_dues" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "exam_moderations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "exam_moderations";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "exam_moderations"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "exam_moderations" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "exam_office_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "exam_office_settings";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "exam_office_settings"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "exam_office_settings" TO kinetix_app;
  END IF;
END $$;
