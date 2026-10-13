CREATE TABLE IF NOT EXISTS "module_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "module" text NOT NULL,
  "settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "module_settings_uq" ON "module_settings" ("tenant_id", "module");--> statement-breakpoint
ALTER TABLE "module_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "module_settings";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "module_settings"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "module_settings" TO kinetix_app;
  END IF;
END $$;
