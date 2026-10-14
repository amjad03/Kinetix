-- Report dashboards: a grid of saved and library reports, shared with roles, and the home dashboard of a role.
CREATE TABLE IF NOT EXISTS "report_dashboards" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "widgets" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "shared_roles" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "default_for_roles" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "report_dashboards_tenant_idx" ON "report_dashboards" ("tenant_id", "created_by");--> statement-breakpoint
ALTER TABLE "report_dashboards" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "report_dashboards";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "report_dashboards"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "report_dashboards" TO kinetix_app;
  END IF;
END $$;
