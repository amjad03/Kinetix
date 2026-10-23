-- W5: guests cast from the browser /cast page with the board's join code; teachers' cloud drive accounts.
ALTER TABLE "cast_sessions" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "cast_sessions" ADD COLUMN IF NOT EXISTS "guest_id" text;--> statement-breakpoint
ALTER TABLE "cast_sessions" DROP CONSTRAINT IF EXISTS "cast_sessions_role_ck";--> statement-breakpoint
ALTER TABLE "cast_sessions" ADD CONSTRAINT "cast_sessions_role_ck" CHECK (sender_role IN ('teacher', 'student', 'guest'));--> statement-breakpoint
ALTER TABLE "cast_sessions" ADD CONSTRAINT "cast_sessions_sender_ck" CHECK ((user_id IS NOT NULL) <> (guest_id IS NOT NULL));--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cast_join_codes" (
  "code" text PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "device_id" uuid NOT NULL REFERENCES "devices"("id") ON DELETE cascade,
  "board_session_id" uuid NOT NULL REFERENCES "board_sessions"("id") ON DELETE cascade,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cast_join_codes_device_idx" ON "cast_join_codes" ("device_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cloud_accounts" (
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "provider" text NOT NULL,
  "account" text,
  "refresh_token_enc" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY ("tenant_id", "user_id", "provider")
);--> statement-breakpoint
ALTER TABLE "cloud_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "cloud_accounts";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "cloud_accounts"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "cloud_accounts" TO kinetix_app;
  END IF;
END $$;
