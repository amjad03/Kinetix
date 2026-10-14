-- Governance: full exports of an institution's data (every table as JSON in a ZIP), made by a background job.
CREATE TABLE IF NOT EXISTS "tenant_exports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "status" text DEFAULT 'queued' NOT NULL,
  "requested_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "note" text DEFAULT '' NOT NULL,
  "file_key" text,
  "size_bytes" bigint,
  "table_count" integer,
  "row_count" bigint,
  "tables" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "finished_at" timestamp with time zone,
  "expires_at" timestamp with time zone,
  "downloaded_at" timestamp with time zone
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tenant_exports_tenant_idx" ON "tenant_exports" ("tenant_id", "created_at");--> statement-breakpoint
ALTER TABLE "tenant_exports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "tenant_exports";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "tenant_exports"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "tenant_exports" TO kinetix_app;
  END IF;
END $$;
