-- Placements pass: apprenticeships under NATS (enrolment, establishment, contract, monthly stipend in paise and the
-- Government of India share by DBT, month by month, and the certificate of proficiency), internship hours, category
-- and mode for the AICTE credit, and alumni referrals.
ALTER TABLE "internships" ADD COLUMN IF NOT EXISTS "hours" numeric(6, 1);--> statement-breakpoint
ALTER TABLE "internships" ADD COLUMN IF NOT EXISTS "category" text DEFAULT 'industry' NOT NULL;--> statement-breakpoint
ALTER TABLE "internships" ADD COLUMN IF NOT EXISTS "mode" text DEFAULT 'onsite' NOT NULL;--> statement-breakpoint
ALTER TABLE "internships" DROP CONSTRAINT IF EXISTS "internships_category_ck";--> statement-breakpoint
ALTER TABLE "internships" ADD CONSTRAINT "internships_category_ck" CHECK ("category" IN ('industry', 'research', 'in_house', 'rural', 'virtual') AND "mode" IN ('onsite', 'remote', 'hybrid') AND coalesce("hours", 0) >= 0);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "apprenticeships" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "company_id" uuid REFERENCES "placement_companies"("id") ON DELETE SET NULL,
  "establishment" text NOT NULL,
  "establishment_code" text DEFAULT '' NOT NULL,
  "nats_enrolment_no" text DEFAULT '' NOT NULL,
  "contract_no" text DEFAULT '' NOT NULL,
  "category" text DEFAULT 'graduate' NOT NULL CHECK ("category" IN ('graduate', 'diploma', 'vocational')),
  "role" text NOT NULL,
  "starts_on" date NOT NULL,
  "ends_on" date NOT NULL,
  "stipend_paise" integer NOT NULL CHECK ("stipend_paise" >= 0),
  "govt_share_paise" integer DEFAULT 0 NOT NULL CHECK ("govt_share_paise" >= 0),
  "status" text DEFAULT 'enrolled' NOT NULL CHECK ("status" IN ('enrolled', 'contract_registered', 'ongoing', 'completed', 'terminated')),
  "certificate_no" text,
  "certificate_on" date,
  "note" text DEFAULT '' NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "apprenticeships_dates_ck" CHECK ("ends_on" >= "starts_on")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "apprenticeships_student_idx" ON "apprenticeships" ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "apprenticeships_contract_uq" ON "apprenticeships" ("tenant_id", "contract_no") WHERE "contract_no" <> '';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "apprenticeship_stipends" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "apprenticeship_id" uuid NOT NULL REFERENCES "apprenticeships"("id") ON DELETE CASCADE,
  "month" date NOT NULL CHECK (extract(day from "month") = 1),
  "employer_paid_paise" integer NOT NULL CHECK ("employer_paid_paise" >= 0),
  "dbt_paise" integer DEFAULT 0 NOT NULL CHECK ("dbt_paise" >= 0),
  "dbt_reference" text DEFAULT '' NOT NULL,
  "paid_on" date,
  "recorded_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "apprenticeship_stipends_month_uq" ON "apprenticeship_stipends" ("apprenticeship_id", "month");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "placement_referrals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "alumni_id" uuid NOT NULL REFERENCES "alumni_profiles"("id") ON DELETE CASCADE,
  "job_post_id" uuid REFERENCES "alumni_job_posts"("id") ON DELETE SET NULL,
  "company" text NOT NULL,
  "role" text DEFAULT '' NOT NULL,
  "message" text DEFAULT '' NOT NULL,
  "status" text DEFAULT 'requested' NOT NULL CHECK ("status" IN ('requested', 'referred', 'interviewing', 'hired', 'declined', 'closed')),
  "note" text DEFAULT '' NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "placement_referrals_alumni_idx" ON "placement_referrals" ("alumni_id", "status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "placement_referrals_student_idx" ON "placement_referrals" ("student_id");--> statement-breakpoint
ALTER TABLE "apprenticeships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "apprenticeships";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "apprenticeships"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "apprenticeships" TO zynetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "apprenticeship_stipends" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "apprenticeship_stipends";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "apprenticeship_stipends"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "apprenticeship_stipends" TO zynetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "placement_referrals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "placement_referrals";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "placement_referrals"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "placement_referrals" TO zynetix_app;
  END IF;
END $$;
