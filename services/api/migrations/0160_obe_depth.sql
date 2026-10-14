-- OBE depth: the justification of each CO-PO / CO-PSO mapping, the PEO-mission consistency matrix, published versions
-- of a programme's vision, mission, PEOs, POs and PSOs, attainment targets per outcome and year, and the year an
-- improvement action closes a gap for (CQI for the next offering).
ALTER TABLE "co_outcome_map" ADD COLUMN IF NOT EXISTS "justification" text;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "peo_mission_map" (
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "program_id" uuid NOT NULL REFERENCES "programs"("id") ON DELETE CASCADE,
  "peo_id" uuid NOT NULL REFERENCES "program_outcomes"("id") ON DELETE CASCADE,
  "mission_id" uuid NOT NULL REFERENCES "program_outcomes"("id") ON DELETE CASCADE,
  "strength" smallint NOT NULL,
  "justification" text,
  CONSTRAINT "peo_mission_map_pk" PRIMARY KEY ("peo_id", "mission_id"),
  CONSTRAINT "peo_mission_map_strength_ck" CHECK ("strength" BETWEEN 1 AND 3)
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "peo_mission_map_program_idx" ON "peo_mission_map" ("program_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "program_outcome_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "program_id" uuid NOT NULL REFERENCES "programs"("id") ON DELETE CASCADE,
  "version" integer NOT NULL,
  "effective_from" text NOT NULL,
  "note" text,
  "statements" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "published_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "published_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "program_outcome_versions_uq" ON "program_outcome_versions" ("program_id", "version");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "obe_targets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "program_id" uuid NOT NULL REFERENCES "programs"("id") ON DELETE CASCADE,
  "academic_year_id" uuid NOT NULL REFERENCES "academic_years"("id") ON DELETE CASCADE,
  "scope" text NOT NULL,
  "target_id" uuid NOT NULL,
  "code" text NOT NULL,
  "target_level" numeric(4, 2) NOT NULL,
  "threshold_percent" numeric(5, 2),
  "rationale" text,
  "set_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "obe_targets_scope_ck" CHECK ("scope" IN ('co', 'po'))
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "obe_targets_uq" ON "obe_targets" ("academic_year_id", "target_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "obe_targets_program_idx" ON "obe_targets" ("program_id", "academic_year_id");--> statement-breakpoint
ALTER TABLE "improvement_actions" ADD COLUMN IF NOT EXISTS "academic_year_id" uuid REFERENCES "academic_years"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "improvement_actions" ADD COLUMN IF NOT EXISTS "code" text;--> statement-breakpoint
ALTER TABLE "peo_mission_map" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "peo_mission_map";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "peo_mission_map"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "peo_mission_map" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "program_outcome_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "program_outcome_versions";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "program_outcome_versions"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "program_outcome_versions" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "obe_targets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "obe_targets";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "obe_targets"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "obe_targets" TO kinetix_app;
  END IF;
END $$;
