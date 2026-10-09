-- Freehand ink on script pages, probation confirmation, staff transfers, training certificates,
-- AI grading drafts, classroom activities tagged with course outcomes, and per-institution signing keys.
ALTER TYPE "ai_task" ADD VALUE IF NOT EXISTS 'gradeAssist';--> statement-breakpoint
ALTER TABLE "eval_annotations" ADD COLUMN IF NOT EXISTS "strokes" jsonb;--> statement-breakpoint
ALTER TABLE "training_records" ADD COLUMN IF NOT EXISTS "certificate_key" text;--> statement-breakpoint
ALTER TABLE "training_records" ADD COLUMN IF NOT EXISTS "certificate_type" text;--> statement-breakpoint
ALTER TABLE "training_records" ADD COLUMN IF NOT EXISTS "certificate_name" text;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "probation_reviews" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "due_on" date NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "hod_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "recommendation" text,
  "hod_remarks" text,
  "recommended_at" timestamp with time zone,
  "decided_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "decided_at" timestamp with time zone,
  "decision_remarks" text,
  "extended_until" date,
  "letter_no" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "probation_reviews_user_idx" ON "probation_reviews" ("user_id", "due_on");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "probation_reviews_open_uq" ON "probation_reviews" ("user_id") WHERE "status" in ('pending', 'recommended');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "staff_transfers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "from_department_id" uuid REFERENCES "departments"("id") ON DELETE SET NULL,
  "to_department_id" uuid REFERENCES "departments"("id") ON DELETE SET NULL,
  "from_designation_id" uuid REFERENCES "designations"("id") ON DELETE SET NULL,
  "to_designation_id" uuid REFERENCES "designations"("id") ON DELETE SET NULL,
  "from_campus_id" uuid REFERENCES "campuses"("id") ON DELETE SET NULL,
  "to_campus_id" uuid REFERENCES "campuses"("id") ON DELETE SET NULL,
  "effective_on" date NOT NULL,
  "reason" text DEFAULT '' NOT NULL,
  "status" text DEFAULT 'scheduled' NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "applied_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "staff_transfers_user_idx" ON "staff_transfers" ("user_id", "effective_on");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "staff_transfers_due_idx" ON "staff_transfers" ("tenant_id", "status", "effective_on");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "grade_suggestions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "allocation_id" uuid REFERENCES "eval_allocations"("id") ON DELETE CASCADE,
  "question_id" uuid REFERENCES "eval_questions"("id") ON DELETE CASCADE,
  "homework_id" uuid REFERENCES "homework"("id") ON DELETE CASCADE,
  "student_id" uuid REFERENCES "students"("id") ON DELETE CASCADE,
  "max_marks" numeric(6,2) NOT NULL,
  "suggested_marks" numeric(6,2) NOT NULL,
  "rationale" text DEFAULT '' NOT NULL,
  "criteria" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "preview" boolean DEFAULT false NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "final_marks" numeric(6,2),
  "requested_by" uuid NOT NULL REFERENCES "users"("id"),
  "decided_by" uuid REFERENCES "users"("id"),
  "decided_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "grade_suggestions_alloc_idx" ON "grade_suggestions" ("allocation_id", "question_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "grade_suggestions_hw_idx" ON "grade_suggestions" ("homework_id", "student_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "poll_co_map" (
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "poll_id" uuid NOT NULL REFERENCES "polls"("id") ON DELETE CASCADE,
  "co_id" uuid NOT NULL REFERENCES "course_outcomes"("id") ON DELETE CASCADE,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY ("poll_id", "co_id")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "poll_co_map_co_idx" ON "poll_co_map" ("co_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant_signing_keys" (
  "tenant_id" uuid PRIMARY KEY NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "key_id" text NOT NULL,
  "public_key_pem" text NOT NULL,
  "private_key_enc" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "probation_reviews" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "probation_reviews";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "probation_reviews"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "staff_transfers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "staff_transfers";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "staff_transfers"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "grade_suggestions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "grade_suggestions";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "grade_suggestions"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "poll_co_map" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "poll_co_map";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "poll_co_map"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "tenant_signing_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "tenant_signing_keys";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "tenant_signing_keys"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "probation_reviews", "staff_transfers", "grade_suggestions", "poll_co_map", "tenant_signing_keys" TO kinetix_app;
  END IF;
END $$;
