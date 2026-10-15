-- Accreditation catalogue and year-wise metric data: framework keys for every NAAC, NBA, NIRF, AISHE and UDISE+ variant,
-- inputs and options per metric and year, wider own-marking scores, DVV clarification detail and per-framework settings.
ALTER TABLE "accreditation_entries" ADD COLUMN IF NOT EXISTS "inputs" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "accreditation_entries" ADD COLUMN IF NOT EXISTS "options" jsonb;--> statement-breakpoint
ALTER TABLE "accreditation_entries" ALTER COLUMN "self_score" TYPE numeric(6, 2);--> statement-breakpoint
UPDATE "accreditation_entries" SET "body" = CASE "body" WHEN 'naac' THEN 'naac-aff-ug' WHEN 'nba' THEN 'nba-ug-eng-t2' WHEN 'nirf' THEN 'nirf-engineering' ELSE "body" END WHERE "body" IN ('naac', 'nba', 'nirf');--> statement-breakpoint
ALTER TABLE "dvv_queries" ADD COLUMN IF NOT EXISTS "framework" text DEFAULT 'naac-aff-ug' NOT NULL;--> statement-breakpoint
ALTER TABLE "dvv_queries" ADD COLUMN IF NOT EXISTS "deviation" text DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE "dvv_queries" ADD COLUMN IF NOT EXISTS "hei_value" numeric(16, 4);--> statement-breakpoint
ALTER TABLE "dvv_queries" ADD COLUMN IF NOT EXISTS "dvv_value" numeric(16, 4);--> statement-breakpoint
ALTER TABLE "dvv_queries" ADD COLUMN IF NOT EXISTS "due_on" date;--> statement-breakpoint
ALTER TABLE "dvv_queries" ADD COLUMN IF NOT EXISTS "responded_by" uuid REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "dvv_queries" ADD COLUMN IF NOT EXISTS "closed_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dvv_queries_framework_idx" ON "dvv_queries" ("framework", "cycle");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "accreditation_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "framework" text NOT NULL,
  "bench" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "weight" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "accreditation_settings_uq" ON "accreditation_settings" ("tenant_id", "framework");--> statement-breakpoint
ALTER TABLE "accreditation_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "accreditation_settings";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "accreditation_settings"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "accreditation_settings" TO zynetix_app;
  END IF;
END $$;
