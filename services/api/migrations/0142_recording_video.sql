ALTER TABLE "recordings" ADD COLUMN IF NOT EXISTS "video_key" text;--> statement-breakpoint
ALTER TABLE "recordings" ADD COLUMN IF NOT EXISTS "video_mime" text;--> statement-breakpoint
ALTER TABLE "recordings" ADD COLUMN IF NOT EXISTS "video_bytes" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "recording_share_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "recording_id" uuid NOT NULL REFERENCES "recordings"("id") ON DELETE cascade,
  "token_hash" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "recording_share_links_token_idx" ON "recording_share_links" ("token_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recording_share_links_recording_idx" ON "recording_share_links" ("recording_id");--> statement-breakpoint
ALTER TABLE "recording_share_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "recording_share_links";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "recording_share_links"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "recording_share_links" TO kinetix_app;
  END IF;
END $$;
