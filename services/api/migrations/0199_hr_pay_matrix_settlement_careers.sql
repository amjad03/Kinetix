-- HR and payroll pass, part 2: the 7th CPC (UGC/AICTE) pay matrix and each staff member's place on it, pay basis for
-- consolidated and hourly (guest) staff, the worked full-and-final settlement, and job postings on the careers page.

CREATE TABLE IF NOT EXISTS "pay_matrix_levels" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "scheme" text DEFAULT 'ugc_7cpc' NOT NULL,
  "level" text NOT NULL,
  "name" text NOT NULL,
  "cadre" text,
  "cells" bigint[] NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pay_matrix_levels_uq" ON "pay_matrix_levels" ("tenant_id", "scheme", "level");--> statement-breakpoint

-- matrix: basic pay from a pay matrix level and cell; structure: lines set by hand; consolidated: one fixed amount, no
-- DA or HRA revisions; hourly: guest and visiting faculty paid for the hours they teach.
ALTER TABLE "staff_profiles" ADD COLUMN IF NOT EXISTS "pay_basis" text DEFAULT 'structure' NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN IF NOT EXISTS "pay_level_id" uuid REFERENCES "pay_matrix_levels"("id") ON DELETE set null;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN IF NOT EXISTS "pay_cell" smallint;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN IF NOT EXISTS "hra_class" text DEFAULT 'Y' NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN IF NOT EXISTS "hourly_rate_paise" bigint;--> statement-breakpoint

-- Each move on the matrix (placement, annual increment, promotion), as the service book records it.
CREATE TABLE IF NOT EXISTS "pay_matrix_moves" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "kind" text NOT NULL,
  "effective_from" date NOT NULL,
  "from_level_id" uuid REFERENCES "pay_matrix_levels"("id") ON DELETE set null,
  "from_cell" smallint,
  "from_basic_paise" bigint,
  "to_level_id" uuid NOT NULL REFERENCES "pay_matrix_levels"("id") ON DELETE cascade,
  "to_cell" smallint NOT NULL,
  "to_basic_paise" bigint NOT NULL,
  "order_no" text DEFAULT '' NOT NULL,
  "note" text DEFAULT '' NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pay_matrix_moves_uq" ON "pay_matrix_moves" ("tenant_id", "user_id", "kind", "effective_from");--> statement-breakpoint

-- Full and final settlement: the worked lines (earnings and recoveries) behind the net figure.
ALTER TABLE "separations" ADD COLUMN IF NOT EXISTS "settlement_lines" jsonb;--> statement-breakpoint

-- Openings on the public careers page, and where an application came from.
ALTER TABLE "job_openings" ADD COLUMN IF NOT EXISTS "published" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "job_openings" ADD COLUMN IF NOT EXISTS "eligibility" text DEFAULT '' NOT NULL;--> statement-breakpoint

-- Yearly reimbursement limits by category (paise), and the declared vacation periods of teaching staff.
ALTER TABLE "hr_settings" ADD COLUMN IF NOT EXISTS "reimbursement_limits" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "hr_settings" ADD COLUMN IF NOT EXISTS "vacations" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pay_matrix_levels', 'pay_matrix_moves'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO zynetix_app', t);
    END IF;
  END LOOP;
END $$;
