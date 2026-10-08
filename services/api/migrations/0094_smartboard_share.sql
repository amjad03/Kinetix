-- Smartboard: whiteboard version history and shareable branded PDF exports.
ALTER TABLE "whiteboards" ADD COLUMN IF NOT EXISTS "version" integer NOT NULL DEFAULT 1;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "whiteboard_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "whiteboard_id" uuid NOT NULL REFERENCES "whiteboards"("id") ON DELETE cascade,
  "version" integer NOT NULL,
  "title" text NOT NULL,
  "page_count" integer NOT NULL,
  "content" jsonb NOT NULL,
  "size_bytes" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "whiteboard_versions_uq" ON "whiteboard_versions" ("whiteboard_id","version");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "whiteboard_exports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "whiteboard_id" uuid NOT NULL REFERENCES "whiteboards"("id") ON DELETE cascade,
  "token" text NOT NULL UNIQUE,
  "storage_key" text NOT NULL,
  "page_count" integer NOT NULL,
  "size_bytes" integer NOT NULL,
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "whiteboard_exports_board_idx" ON "whiteboard_exports" ("whiteboard_id");--> statement-breakpoint
ALTER TABLE "whiteboard_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "whiteboard_versions";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "whiteboard_versions"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "whiteboard_versions" TO kinetix_app;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "whiteboard_exports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "whiteboard_exports";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "whiteboard_exports"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "whiteboard_exports" TO kinetix_app;
  END IF;
END $$;
--> statement-breakpoint
