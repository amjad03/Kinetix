-- Payroll depth: components worked out as a percentage of another (DA and HRA on basic) with a dated rate history
-- for DA revisions, supplementary and reversed runs (one live regular run per month, any number of
-- supplementary ones), Labour Welfare Fund settings, and early closure of staff loans.
ALTER TABLE "salary_components"
  ADD COLUMN IF NOT EXISTS "calc" text DEFAULT 'fixed' NOT NULL,
  ADD COLUMN IF NOT EXISTS "percent" numeric(7, 3),
  ADD COLUMN IF NOT EXISTS "base_code" text DEFAULT 'BASIC' NOT NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "salary_component_rates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "component_id" uuid NOT NULL REFERENCES "salary_components"("id") ON DELETE CASCADE,
  "effective_month" text NOT NULL,
  "percent" numeric(7, 3) NOT NULL,
  "note" text DEFAULT '' NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "salary_component_rates_uq" ON "salary_component_rates" ("component_id", "effective_month");--> statement-breakpoint
ALTER TABLE "payroll_runs"
  ADD COLUMN IF NOT EXISTS "kind" text DEFAULT 'regular' NOT NULL,
  ADD COLUMN IF NOT EXISTS "seq" smallint DEFAULT 1 NOT NULL,
  ADD COLUMN IF NOT EXISTS "staff_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  ADD COLUMN IF NOT EXISTS "note" text DEFAULT '' NOT NULL,
  ADD COLUMN IF NOT EXISTS "reversed_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "reversed_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "reversal_reason" text;--> statement-breakpoint
DROP INDEX IF EXISTS "payroll_runs_month_uq";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payroll_runs_month_uq" ON "payroll_runs" ("tenant_id", "month", "seq") WHERE "status" <> 'reversed';--> statement-breakpoint
ALTER TABLE "payroll_settings"
  ADD COLUMN IF NOT EXISTS "lwf" jsonb DEFAULT '{"enabled": true, "employeePaise": 5000, "employerPaise": 10000, "months": [12]}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_loans"
  ADD COLUMN IF NOT EXISTS "closed_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "close_note" text;--> statement-breakpoint
ALTER TABLE "salary_component_rates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "salary_component_rates";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "salary_component_rates"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "salary_component_rates" TO kinetix_app;
  END IF;
END $$;
