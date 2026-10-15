-- Exam cell depth: more session kinds, best-of-N components, malpractice / not-eligible mark codes, late registration,
-- result freezing, and the exam cell's own records (withheld results, grace applications, double-entry checks,
-- valuation camps and bundles, answer-book accounts, duty swaps, reschedules, result runs and revisions).
ALTER TYPE "public"."exam_session_kind" ADD VALUE IF NOT EXISTS 'improvement';--> statement-breakpoint
ALTER TYPE "public"."exam_session_kind" ADD VALUE IF NOT EXISTS 'special';--> statement-breakpoint
ALTER TYPE "public"."exam_session_kind" ADD VALUE IF NOT EXISTS 'practical';--> statement-breakpoint
ALTER TYPE "public"."exam_session_kind" ADD VALUE IF NOT EXISTS 'viva';--> statement-breakpoint
ALTER TABLE "scheme_components" ADD COLUMN IF NOT EXISTS "best_of" smallint;--> statement-breakpoint
ALTER TABLE "marks" ADD COLUMN IF NOT EXISTS "code" text;--> statement-breakpoint
ALTER TABLE "exam_registration_windows" ADD COLUMN IF NOT EXISTS "late_until" date;--> statement-breakpoint
ALTER TABLE "exam_sessions" ADD COLUMN IF NOT EXISTS "frozen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "exam_sessions" ADD COLUMN IF NOT EXISTS "frozen_by" uuid REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "result_withholds" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "session_id" uuid NOT NULL REFERENCES "exam_sessions"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id"),
  "reason" text NOT NULL,
  "note" text,
  "status" text DEFAULT 'held' NOT NULL,
  "held_by" uuid NOT NULL REFERENCES "users"("id"),
  "held_at" timestamp with time zone DEFAULT now() NOT NULL,
  "released_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "released_at" timestamp with time zone,
  "release_note" text
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "result_withholds_session_idx" ON "result_withholds" ("session_id", "status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "result_withholds_student_idx" ON "result_withholds" ("student_id");--> statement-breakpoint
ALTER TABLE "result_withholds" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "result_withholds";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "result_withholds"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "result_withholds" TO zynetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "grace_applications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "session_id" uuid NOT NULL REFERENCES "exam_sessions"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id"),
  "subject_id" uuid REFERENCES "subjects"("id"),
  "category" text NOT NULL,
  "marks_requested" numeric(5, 2) NOT NULL,
  "marks_approved" numeric(5, 2),
  "evidence" text DEFAULT '' NOT NULL,
  "status" text DEFAULT 'requested' NOT NULL,
  "decision_note" text,
  "decided_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "decided_at" timestamp with time zone,
  "applied_at" timestamp with time zone,
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "grace_applications_session_idx" ON "grace_applications" ("session_id", "status");--> statement-breakpoint
ALTER TABLE "grace_applications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "grace_applications";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "grace_applications"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "grace_applications" TO zynetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mark_entry_checks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "paper_id" uuid NOT NULL REFERENCES "exam_papers"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id"),
  "first_marks" numeric(6, 2),
  "first_absent" boolean DEFAULT false NOT NULL,
  "first_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "first_at" timestamp with time zone,
  "second_marks" numeric(6, 2),
  "second_absent" boolean DEFAULT false NOT NULL,
  "second_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "second_at" timestamp with time zone,
  "status" text DEFAULT 'pending' NOT NULL,
  "resolved_marks" numeric(6, 2),
  "resolved_absent" boolean DEFAULT false NOT NULL,
  "resolved_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "resolved_at" timestamp with time zone,
  "posted_at" timestamp with time zone,
  "note" text
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mark_entry_checks_uq" ON "mark_entry_checks" ("paper_id", "student_id");--> statement-breakpoint
ALTER TABLE "mark_entry_checks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "mark_entry_checks";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "mark_entry_checks"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "mark_entry_checks" TO zynetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "valuation_camps" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "session_id" uuid NOT NULL REFERENCES "exam_sessions"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "venue" text DEFAULT '' NOT NULL,
  "starts_on" date NOT NULL,
  "ends_on" date NOT NULL,
  "chief_examiner_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "valuation_camps_session_idx" ON "valuation_camps" ("session_id");--> statement-breakpoint
ALTER TABLE "valuation_camps" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "valuation_camps";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "valuation_camps"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "valuation_camps" TO zynetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "valuation_bundles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "camp_id" uuid NOT NULL REFERENCES "valuation_camps"("id") ON DELETE CASCADE,
  "paper_id" uuid NOT NULL REFERENCES "exam_papers"("id") ON DELETE CASCADE,
  "bundle_no" text NOT NULL,
  "scripts" integer NOT NULL,
  "examiner_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "status" text DEFAULT 'packed' NOT NULL,
  "issued_at" timestamp with time zone,
  "returned_at" timestamp with time zone,
  "valued" integer DEFAULT 0 NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "valuation_bundles_no_uq" ON "valuation_bundles" ("camp_id", "bundle_no");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "valuation_bundles_examiner_idx" ON "valuation_bundles" ("examiner_id");--> statement-breakpoint
ALTER TABLE "valuation_bundles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "valuation_bundles";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "valuation_bundles"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "valuation_bundles" TO zynetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "valuation_daily_counts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "bundle_id" uuid NOT NULL REFERENCES "valuation_bundles"("id") ON DELETE CASCADE,
  "day" date NOT NULL,
  "scripts" integer NOT NULL,
  "recorded_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "valuation_daily_counts_uq" ON "valuation_daily_counts" ("bundle_id", "day");--> statement-breakpoint
ALTER TABLE "valuation_daily_counts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "valuation_daily_counts";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "valuation_daily_counts"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "valuation_daily_counts" TO zynetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "answer_sheet_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "session_id" uuid NOT NULL REFERENCES "exam_sessions"("id") ON DELETE CASCADE,
  "room_id" uuid NOT NULL REFERENCES "rooms"("id"),
  "exam_date" date NOT NULL,
  "sitting" text NOT NULL,
  "received" integer DEFAULT 0 NOT NULL,
  "issued" integer DEFAULT 0 NOT NULL,
  "additional" integer DEFAULT 0 NOT NULL,
  "spoiled" integer DEFAULT 0 NOT NULL,
  "returned" integer DEFAULT 0 NOT NULL,
  "present" integer DEFAULT 0 NOT NULL,
  "absent" integer DEFAULT 0 NOT NULL,
  "malpractice" integer DEFAULT 0 NOT NULL,
  "remarks" text,
  "status" text DEFAULT 'draft' NOT NULL,
  "submitted_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "submitted_at" timestamp with time zone,
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "answer_sheet_accounts_uq" ON "answer_sheet_accounts" ("session_id", "room_id", "exam_date", "sitting");--> statement-breakpoint
ALTER TABLE "answer_sheet_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "answer_sheet_accounts";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "answer_sheet_accounts"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "answer_sheet_accounts" TO zynetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invigilation_swaps" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "duty_id" uuid NOT NULL REFERENCES "invigilation_duties"("id") ON DELETE CASCADE,
  "requested_by" uuid NOT NULL REFERENCES "users"("id"),
  "swap_with" uuid NOT NULL REFERENCES "users"("id"),
  "reason" text NOT NULL,
  "status" text DEFAULT 'requested' NOT NULL,
  "decided_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "decided_at" timestamp with time zone,
  "decision_note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invigilation_swaps_duty_idx" ON "invigilation_swaps" ("duty_id");--> statement-breakpoint
ALTER TABLE "invigilation_swaps" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "invigilation_swaps";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "invigilation_swaps"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "invigilation_swaps" TO zynetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "exam_reschedules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "session_id" uuid NOT NULL REFERENCES "exam_sessions"("id") ON DELETE CASCADE,
  "paper_id" uuid NOT NULL REFERENCES "exam_papers"("id") ON DELETE CASCADE,
  "from_date" date NOT NULL,
  "from_starts_at" time NOT NULL,
  "from_ends_at" time NOT NULL,
  "to_date" date NOT NULL,
  "to_starts_at" time NOT NULL,
  "to_ends_at" time NOT NULL,
  "reason" text NOT NULL,
  "notified" integer DEFAULT 0 NOT NULL,
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exam_reschedules_session_idx" ON "exam_reschedules" ("session_id");--> statement-breakpoint
ALTER TABLE "exam_reschedules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "exam_reschedules";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "exam_reschedules"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "exam_reschedules" TO zynetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "result_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "session_id" uuid NOT NULL REFERENCES "exam_sessions"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "snapshot" jsonb,
  "note" text,
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "result_runs_session_idx" ON "result_runs" ("session_id", "created_at");--> statement-breakpoint
ALTER TABLE "result_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "result_runs";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "result_runs"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "result_runs" TO zynetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "result_revisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "session_id" uuid NOT NULL REFERENCES "exam_sessions"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id"),
  "version" integer NOT NULL,
  "kind" text NOT NULL,
  "reason" text NOT NULL,
  "before" jsonb NOT NULL,
  "after" jsonb NOT NULL,
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "result_revisions_uq" ON "result_revisions" ("session_id", "student_id", "version");--> statement-breakpoint
ALTER TABLE "result_revisions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "result_revisions";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "result_revisions"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "result_revisions" TO zynetix_app;
  END IF;
END $$;
