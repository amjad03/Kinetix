-- Zynetix panel platform (docs/zynetix/BOARD_PLAN.md, W4): OTA releases of the board app and their
-- rollouts with per-board status, each board's update channel, and the panel home's allow-listed apps.
ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "update_channel" text DEFAULT 'stable' NOT NULL;--> statement-breakpoint
ALTER TABLE "devices" DROP CONSTRAINT IF EXISTS "devices_update_channel_ck";--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_update_channel_ck" CHECK (update_channel IN ('stable', 'beta'));--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "panel_releases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid REFERENCES "tenants"("id") ON DELETE cascade,
  "scope" text DEFAULT 'institution' NOT NULL,
  "platform" text NOT NULL,
  "version" text NOT NULL,
  "channel" text DEFAULT 'stable' NOT NULL,
  "notes" text,
  "file_key" text,
  "file_name" text,
  "file_bytes" bigint,
  "file_mime" text,
  "sha256" text,
  "created_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "panel_releases_scope_ck" CHECK ((scope = 'platform' AND tenant_id IS NULL) OR (scope = 'institution' AND tenant_id IS NOT NULL)),
  CONSTRAINT "panel_releases_platform_ck" CHECK (platform IN ('android', 'windows', 'macos', 'linux')),
  CONSTRAINT "panel_releases_channel_ck" CHECK (channel IN ('stable', 'beta'))
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "panel_releases_tenant_idx" ON "panel_releases" ("tenant_id", "platform", "created_at");--> statement-breakpoint
-- As topic_materials (0139): platform rows are read by every institution and written by the owner role.
DO $$
BEGIN
  ALTER TABLE panel_releases ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS tenant_isolation ON panel_releases;
  DROP POLICY IF EXISTS global_read ON panel_releases;
  CREATE POLICY tenant_isolation ON panel_releases
    USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (scope <> 'platform' AND tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
  CREATE POLICY global_read ON panel_releases FOR SELECT USING (scope = 'platform' AND tenant_id IS NULL);
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON panel_releases TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "panel_rollouts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "release_id" uuid NOT NULL REFERENCES "panel_releases"("id") ON DELETE cascade,
  "target" text DEFAULT 'all' NOT NULL,
  "device_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "stopped_at" timestamp with time zone,
  CONSTRAINT "panel_rollouts_target_ck" CHECK (target IN ('all', 'selected'))
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "panel_rollouts_tenant_idx" ON "panel_rollouts" ("tenant_id", "active", "created_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "panel_update_status" (
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "device_id" uuid NOT NULL REFERENCES "devices"("id") ON DELETE cascade,
  "release_id" uuid NOT NULL REFERENCES "panel_releases"("id") ON DELETE cascade,
  "state" text NOT NULL,
  "error" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "panel_update_status_pk" PRIMARY KEY ("device_id", "release_id"),
  CONSTRAINT "panel_update_status_state_ck" CHECK (state IN ('offered', 'downloading', 'downloaded', 'installing', 'installed', 'failed', 'declined'))
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "panel_launcher_apps" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "device_id" uuid REFERENCES "devices"("id") ON DELETE cascade,
  "package" text NOT NULL,
  "label" text NOT NULL,
  "icon_url" text,
  "position" integer NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "panel_launcher_apps_tenant_idx" ON "panel_launcher_apps" ("tenant_id", "device_id", "position");--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['panel_rollouts', 'panel_update_status', 'panel_launcher_apps'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO kinetix_app', t);
    END IF;
  END LOOP;
END $$;
