-- Admissions depth: counsellor assignment rules, approval requests (management quota, cancellation with refund,
-- programme change), refund slabs, the original-certificate custody register, saved application drafts, and new
-- columns on enquiries (UTM campaign, place, merge), applications (admission type, nationality, quota) and commissions.
CREATE TABLE IF NOT EXISTS "admission_assignment_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "program_id" uuid REFERENCES "programs"("id") ON DELETE CASCADE,
  "source" text,
  "region" text,
  "mode" text DEFAULT 'round_robin' NOT NULL,
  "counsellor_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "next_index" integer DEFAULT 0 NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "admission_assignment_rules_name_uq" ON "admission_assignment_rules" ("tenant_id", "name");--> statement-breakpoint
ALTER TABLE "admission_assignment_rules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "admission_assignment_rules";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "admission_assignment_rules"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "admission_assignment_rules" TO zynetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admission_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "application_id" uuid NOT NULL REFERENCES "applications"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "reason" text NOT NULL,
  "data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "requested_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "decided_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "decided_at" timestamp with time zone,
  "decision_note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admission_requests_status_idx" ON "admission_requests" ("tenant_id", "status", "created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admission_requests_app_idx" ON "admission_requests" ("application_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "admission_requests_open_uq" ON "admission_requests" ("application_id", "kind") WHERE "status" = 'pending';--> statement-breakpoint
ALTER TABLE "admission_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "admission_requests";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "admission_requests"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "admission_requests" TO zynetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admission_refund_slabs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "label" text NOT NULL,
  "upto_days" integer,
  "percent" smallint NOT NULL,
  "deduction_percent" smallint DEFAULT 0 NOT NULL,
  "deduction_cap_paise" bigint DEFAULT 0 NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "admission_refund_slabs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "admission_refund_slabs";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "admission_refund_slabs"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "admission_refund_slabs" TO zynetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admission_custody_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "application_id" uuid REFERENCES "applications"("id") ON DELETE SET NULL,
  "student_id" uuid REFERENCES "students"("id") ON DELETE SET NULL,
  "holder_name" text NOT NULL,
  "document" text NOT NULL,
  "reference_no" text,
  "received_on" date NOT NULL,
  "received_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "status" text DEFAULT 'held' NOT NULL,
  "returned_on" date,
  "returned_to" text,
  "returned_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "acknowledgement" text,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admission_custody_status_idx" ON "admission_custody_items" ("tenant_id", "status", "received_on");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admission_custody_student_idx" ON "admission_custody_items" ("student_id");--> statement-breakpoint
ALTER TABLE "admission_custody_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "admission_custody_items";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "admission_custody_items"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "admission_custody_items" TO zynetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "application_drafts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "cycle_id" uuid NOT NULL REFERENCES "admission_cycles"("id") ON DELETE CASCADE,
  "token_hash" text NOT NULL,
  "applicant_name" text DEFAULT '' NOT NULL,
  "phone" text DEFAULT '' NOT NULL,
  "data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "step" smallint DEFAULT 1 NOT NULL,
  "submitted_application_id" uuid REFERENCES "applications"("id") ON DELETE SET NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "application_drafts_cycle_idx" ON "application_drafts" ("tenant_id", "cycle_id", "created_at");--> statement-breakpoint
ALTER TABLE "application_drafts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "application_drafts";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "application_drafts"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "application_drafts" TO zynetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "enquiries" ADD COLUMN IF NOT EXISTS "utm_campaign" text;--> statement-breakpoint
ALTER TABLE "enquiries" ADD COLUMN IF NOT EXISTS "city" text;--> statement-breakpoint
ALTER TABLE "enquiries" ADD COLUMN IF NOT EXISTS "region" text;--> statement-breakpoint
ALTER TABLE "enquiries" ADD COLUMN IF NOT EXISTS "merged_into_id" uuid;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "admission_type" text DEFAULT 'regular' NOT NULL;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "entry_term_override" smallint;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "nationality" text DEFAULT 'indian' NOT NULL;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "quota" text DEFAULT 'merit' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_commissions" ADD COLUMN IF NOT EXISTS "clawed_back_at" timestamp with time zone;
