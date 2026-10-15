-- Record depth kit imports: an uploaded file is parsed and checked once (preview with row errors), kept here, and
-- committed from the stored rows, so the result report stays available afterwards.
CREATE TABLE IF NOT EXISTS "record_imports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "entity" text NOT NULL,
  "file_name" text NOT NULL,
  "mode" text DEFAULT 'upsert' NOT NULL,
  "status" text DEFAULT 'validated' NOT NULL,
  "headers" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "rows" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "preview" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "result" jsonb,
  "totals" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "committed_at" timestamp with time zone
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "record_imports_entity_idx" ON "record_imports" ("tenant_id", "entity", "created_at");--> statement-breakpoint
ALTER TABLE "record_imports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "record_imports";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "record_imports"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "record_imports" TO zynetix_app;
  END IF;
END $$;
