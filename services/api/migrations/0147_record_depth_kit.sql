-- Record depth kit: the recycle bin (deleted rows kept as JSON snapshots until restored or purged), saved views
-- (per user, per page; shareable with roles) and a manual sort order on the orderable academic structure.
CREATE TABLE IF NOT EXISTS "deleted_records" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "entity" text NOT NULL,
  "module" text NOT NULL,
  "table_name" text NOT NULL,
  "record_id" text NOT NULL,
  "label" text NOT NULL,
  "snapshot" jsonb NOT NULL,
  "row_count" integer DEFAULT 1 NOT NULL,
  "deleted_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "deleted_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deleted_records_tenant_at_idx" ON "deleted_records" ("tenant_id", "deleted_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deleted_records_record_idx" ON "deleted_records" ("tenant_id", "table_name", "record_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deleted_records_module_idx" ON "deleted_records" ("tenant_id", "module", "deleted_at");--> statement-breakpoint
ALTER TABLE "deleted_records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "deleted_records";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "deleted_records"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "deleted_records" TO zynetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "saved_views" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "page" text NOT NULL,
  "name" text NOT NULL,
  "state" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "shared_roles" text[] DEFAULT '{}'::text[] NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "saved_views_name_uq" ON "saved_views" ("tenant_id", "user_id", "page", lower("name"));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saved_views_page_idx" ON "saved_views" ("tenant_id", "page");--> statement-breakpoint
ALTER TABLE "saved_views" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "saved_views";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "saved_views"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "saved_views" TO zynetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "departments" ADD COLUMN IF NOT EXISTS "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN IF NOT EXISTS "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sections" ADD COLUMN IF NOT EXISTS "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "subjects" ADD COLUMN IF NOT EXISTS "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Existing rows start in name order, so the first drag does not shuffle everything else.
UPDATE "departments" d SET "sort_order" = o.n FROM (SELECT id, row_number() OVER (PARTITION BY tenant_id ORDER BY lower(name)) * 10 AS n FROM "departments") o WHERE o.id = d.id;--> statement-breakpoint
UPDATE "programs" p SET "sort_order" = o.n FROM (SELECT id, row_number() OVER (PARTITION BY tenant_id ORDER BY lower(name)) * 10 AS n FROM "programs") o WHERE o.id = p.id;--> statement-breakpoint
UPDATE "sections" s SET "sort_order" = o.n FROM (SELECT id, row_number() OVER (PARTITION BY program_id, academic_year_id, term ORDER BY lower(name)) * 10 AS n FROM "sections") o WHERE o.id = s.id;--> statement-breakpoint
UPDATE "subjects" s SET "sort_order" = o.n FROM (SELECT id, row_number() OVER (PARTITION BY program_id, term ORDER BY lower(code)) * 10 AS n FROM "subjects") o WHERE o.id = s.id;
