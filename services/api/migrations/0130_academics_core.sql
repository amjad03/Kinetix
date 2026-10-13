-- Academics core: module settings, approval requests (handover, section change, TC, timetable change, substitution), marks lock and lesson plan approval.
CREATE TABLE IF NOT EXISTS "academic_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "kind" text NOT NULL,
  "value" jsonb NOT NULL,
  "updated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "academic_settings_kind_uq" ON "academic_settings" ("tenant_id", "kind");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "academic_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "number" text NOT NULL,
  "kind" text NOT NULL,
  "student_id" uuid REFERENCES "students"("id"),
  "title" text NOT NULL,
  "reason" text DEFAULT '' NOT NULL,
  "payload" jsonb NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "steps" jsonb NOT NULL,
  "outcome" jsonb,
  "requested_by" uuid NOT NULL REFERENCES "users"("id"),
  "decided_at" timestamp with time zone,
  "version" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "academic_requests_status_idx" ON "academic_requests" ("tenant_id", "status", "kind");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "academic_requests_number_uq" ON "academic_requests" ("tenant_id", "number");--> statement-breakpoint
ALTER TABLE "assessments" ADD COLUMN IF NOT EXISTS "locked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "assessments" ADD COLUMN IF NOT EXISTS "locked_by" uuid REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "lesson_plans" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "lesson_plans" ADD COLUMN IF NOT EXISTS "submitted_at" timestamp with time zone;--> statement-breakpoint
UPDATE "lesson_plans" SET "status" = 'approved' WHERE "reviewed_at" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "academic_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "academic_settings";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "academic_settings"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "academic_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "academic_requests";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "academic_requests"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "academic_settings", "academic_requests" TO kinetix_app;
  END IF;
END $$;
