-- Affiliating university / board profiles: the institution's profile and scheme, per-programme schemes and overrides.
CREATE TABLE IF NOT EXISTS "affiliation_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL UNIQUE REFERENCES "tenants"("id") ON DELETE CASCADE,
  "profile_code" text NOT NULL,
  "scheme_code" text NOT NULL,
  "overrides" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "programme_affiliations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "program_id" uuid NOT NULL REFERENCES "programs"("id") ON DELETE CASCADE,
  "profile_code" text NOT NULL,
  "scheme_code" text NOT NULL,
  "overrides" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "programme_affiliations_uq" ON "programme_affiliations" ("tenant_id", "program_id");--> statement-breakpoint
ALTER TABLE "affiliation_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "affiliation_settings";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "affiliation_settings"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "programme_affiliations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "programme_affiliations";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "programme_affiliations"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "affiliation_settings" TO kinetix_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "programme_affiliations" TO kinetix_app;
  END IF;
END $$;
