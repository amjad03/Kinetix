-- Zynetix standalone board edition (docs/zynetix/PLAN.md): the institution's edition, topic
-- materials beyond videos, the AI answer log's topic and throttled outcome, and edge telemetry.
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "edition" text DEFAULT 'full' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" DROP CONSTRAINT IF EXISTS "tenants_edition_ck";--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_edition_ck" CHECK (edition IN ('full', 'board'));--> statement-breakpoint
ALTER TYPE "ai_outcome" ADD VALUE IF NOT EXISTS 'throttled';--> statement-breakpoint
ALTER TABLE "ai_usage" ADD COLUMN IF NOT EXISTS "topic_id" uuid REFERENCES "topics"("id") ON DELETE set null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_usage_tenant_outcome_idx" ON "ai_usage" ("tenant_id", "outcome", "created_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "topic_materials" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid REFERENCES "tenants"("id") ON DELETE cascade,
  "scope" text DEFAULT 'institution' NOT NULL,
  "topic_id" uuid NOT NULL REFERENCES "topics"("id") ON DELETE cascade,
  "kind" text NOT NULL,
  "title" text NOT NULL,
  "url" text,
  "ref" text,
  "author" text,
  "book_chapter" text,
  "page_from" integer,
  "page_to" integer,
  "language" "language" DEFAULT 'en' NOT NULL,
  "audience" text[] DEFAULT '{board,teacher,student,parent}'::text[] NOT NULL,
  "status" text DEFAULT 'approved' NOT NULL,
  "review_reason" text,
  "reviewed_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "reviewed_at" timestamp with time zone,
  "position" integer NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "topic_materials_scope_ck" CHECK ((scope = 'platform' AND tenant_id IS NULL) OR (scope = 'institution' AND tenant_id IS NOT NULL)),
  CONSTRAINT "topic_materials_kind_ck" CHECK (kind IN ('pdf', 'book', 'syllabus', 'link', 'animation', 'model3d', 'sim')),
  CONSTRAINT "topic_materials_status_ck" CHECK (status IN ('pending', 'approved', 'rejected')),
  CONSTRAINT "topic_materials_pages_ck" CHECK (page_from IS NULL OR page_to IS NULL OR page_from <= page_to)
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "topic_materials_topic_idx" ON "topic_materials" ("topic_id", "position");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "topic_materials_tenant_idx" ON "topic_materials" ("tenant_id", "status");--> statement-breakpoint
-- Platform rows (tenant_id null) are readable by every institution and written only by the owner
-- role (src/platform/); an institution reads and writes only its own rows (as concept_videos, 0066).
DO $$
BEGIN
  ALTER TABLE topic_materials ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS tenant_isolation ON topic_materials;
  DROP POLICY IF EXISTS global_read ON topic_materials;
  CREATE POLICY tenant_isolation ON topic_materials
    USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (scope <> 'platform' AND tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
  CREATE POLICY global_read ON topic_materials FOR SELECT USING (scope = 'platform' AND tenant_id IS NULL);
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON topic_materials TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "device_telemetry" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "device_id" uuid NOT NULL REFERENCES "devices"("id") ON DELETE cascade,
  "at" timestamp with time zone DEFAULT now() NOT NULL,
  "cpu_pct" real,
  "gpu_pct" real,
  "npu_pct" real,
  "ram_pct" real,
  "disk_pct" real,
  "cpu_temp_c" real,
  "gpu_temp_c" real,
  "ai_inferences" integer DEFAULT 0 NOT NULL,
  "ai_inference_ms" integer DEFAULT 0 NOT NULL,
  "app_version" text
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "device_telemetry_device_at_idx" ON "device_telemetry" ("tenant_id", "device_id", "at");--> statement-breakpoint
ALTER TABLE "device_telemetry" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "device_telemetry";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "device_telemetry"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "device_telemetry" TO kinetix_app;
  END IF;
END $$;
