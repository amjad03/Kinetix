-- Fee setup depth: fee heads as records (priority, ledger, GST, refundable, optional), structures by programme ×
-- batch × quota × category × term with credit-hour fees, each student's fee profile, invoice lines by head,
-- assignments (bulk, re-assignment with a delta, pro-rata), concession types, approval chains, fine slabs,
-- fine waivers and one-student instalment plans that wait for approval.
CREATE TABLE IF NOT EXISTS "fee_heads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "kind" text DEFAULT 'other' NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "account_code" text DEFAULT '4000' NOT NULL,
  "fund_code" text,
  "gst_rate" numeric(5, 2) DEFAULT 0 NOT NULL,
  "sac" text,
  "refundable" boolean DEFAULT true NOT NULL,
  "optional" boolean DEFAULT false NOT NULL,
  "linked_module" text DEFAULT 'none' NOT NULL,
  "receipt_prefix" text,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fee_heads_code_uq" ON "fee_heads" ("tenant_id","code");--> statement-breakpoint
ALTER TABLE "fee_heads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "fee_heads";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "fee_heads"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "fee_heads" TO zynetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "fee_structures" ADD COLUMN IF NOT EXISTS "batch" text;--> statement-breakpoint
ALTER TABLE "fee_structures" ADD COLUMN IF NOT EXISTS "quota" text;--> statement-breakpoint
ALTER TABLE "fee_structures" ADD COLUMN IF NOT EXISTS "category" text;--> statement-breakpoint
ALTER TABLE "fee_structures" ADD COLUMN IF NOT EXISTS "term" smallint;--> statement-breakpoint
ALTER TABLE "fee_structures" ADD COLUMN IF NOT EXISTS "per_credit_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "fee_structures" ADD COLUMN IF NOT EXISTS "credit_head" text;--> statement-breakpoint
ALTER TABLE "fee_structures" ADD COLUMN IF NOT EXISTS "instalment_plan_id" uuid REFERENCES "fee_instalment_plans"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "fee_structures" ADD COLUMN IF NOT EXISTS "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fee_student_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "quota" text,
  "category" text,
  "batch" text,
  "opted_heads" text[] DEFAULT '{}' NOT NULL,
  "note" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fee_student_profiles_student_uq" ON "fee_student_profiles" ("student_id");--> statement-breakpoint
ALTER TABLE "fee_student_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "fee_student_profiles";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "fee_student_profiles"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "fee_student_profiles" TO zynetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "fee_invoices" ADD COLUMN IF NOT EXISTS "structure_id" uuid REFERENCES "fee_structures"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "fee_invoices" ADD COLUMN IF NOT EXISTS "academic_year" text;--> statement-breakpoint
ALTER TABLE "fee_invoices" ADD COLUMN IF NOT EXISTS "kind" text DEFAULT 'fee' NOT NULL;--> statement-breakpoint
ALTER TABLE "fee_invoices" ADD COLUMN IF NOT EXISTS "carried_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "fee_invoices" ADD COLUMN IF NOT EXISTS "carried_to" uuid REFERENCES "fee_invoices"("id") ON DELETE SET NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fee_invoice_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "invoice_id" uuid NOT NULL REFERENCES "fee_invoices"("id") ON DELETE CASCADE,
  "head_code" text NOT NULL,
  "head_name" text NOT NULL,
  "priority" integer DEFAULT 0 NOT NULL,
  "amount_paise" bigint NOT NULL,
  "waived_paise" bigint DEFAULT 0 NOT NULL,
  "gst_rate" numeric(5, 2) DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fee_invoice_lines_invoice_idx" ON "fee_invoice_lines" ("invoice_id","priority");--> statement-breakpoint
ALTER TABLE "fee_invoice_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "fee_invoice_lines";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "fee_invoice_lines"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "fee_invoice_lines" TO zynetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fee_assignments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "structure_id" uuid NOT NULL REFERENCES "fee_structures"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "invoice_id" uuid REFERENCES "fee_invoices"("id") ON DELETE SET NULL,
  "amount_paise" bigint NOT NULL,
  "prorata_percent" integer DEFAULT 100 NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "assigned_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fee_assignments_active_uq" ON "fee_assignments" ("structure_id","student_id") WHERE status = 'active';--> statement-breakpoint
ALTER TABLE "fee_assignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "fee_assignments";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "fee_assignments"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "fee_assignments" TO zynetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fee_concession_types" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "category" text DEFAULT 'other' NOT NULL,
  "mode" text DEFAULT 'percent' NOT NULL,
  "percent" integer,
  "amount_paise" bigint,
  "head_codes" text[] DEFAULT '{}' NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fee_concession_types_name_uq" ON "fee_concession_types" ("tenant_id", lower("name"));--> statement-breakpoint
ALTER TABLE "fee_concession_types" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "fee_concession_types";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "fee_concession_types"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "fee_concession_types" TO zynetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "fee_concessions" ADD COLUMN IF NOT EXISTS "type_id" uuid REFERENCES "fee_concession_types"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "fee_concessions" ADD COLUMN IF NOT EXISTS "level" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "fee_concessions" ADD COLUMN IF NOT EXISTS "trail" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "fee_concessions" ADD COLUMN IF NOT EXISTS "head_codes" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "fee_late_fee_rules" ADD COLUMN IF NOT EXISTS "mode" text DEFAULT 'daily' NOT NULL;--> statement-breakpoint
ALTER TABLE "fee_late_fee_rules" ADD COLUMN IF NOT EXISTS "slabs" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fee_waiver_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "number" text NOT NULL,
  "late_fee_id" uuid NOT NULL REFERENCES "fee_late_fees"("id") ON DELETE CASCADE,
  "invoice_id" uuid NOT NULL REFERENCES "fee_invoices"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "amount_paise" bigint NOT NULL,
  "reason" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "level" integer DEFAULT 0 NOT NULL,
  "trail" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "requested_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "decided_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "decided_at" timestamp with time zone,
  "decision_note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fee_waiver_requests_number_uq" ON "fee_waiver_requests" ("tenant_id","number");--> statement-breakpoint
ALTER TABLE "fee_waiver_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "fee_waiver_requests";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "fee_waiver_requests"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "fee_waiver_requests" TO zynetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fee_custom_plans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "number" text NOT NULL,
  "invoice_id" uuid NOT NULL REFERENCES "fee_invoices"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "parts" jsonb NOT NULL,
  "reason" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "level" integer DEFAULT 0 NOT NULL,
  "trail" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "requested_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "decided_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "decided_at" timestamp with time zone,
  "decision_note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fee_custom_plans_number_uq" ON "fee_custom_plans" ("tenant_id","number");--> statement-breakpoint
ALTER TABLE "fee_custom_plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "fee_custom_plans";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "fee_custom_plans"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "fee_custom_plans" TO zynetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "fee_accounts_settings" ADD COLUMN IF NOT EXISTS "chains" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "fee_accounts_settings" ADD COLUMN IF NOT EXISTS "dues_block" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "fee_accounts_settings" ADD COLUMN IF NOT EXISTS "reminders" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "fee_accounts_settings" ADD COLUMN IF NOT EXISTS "convenience" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "fee_accounts_settings" ADD COLUMN IF NOT EXISTS "refund_rules" jsonb DEFAULT '[]'::jsonb NOT NULL;
