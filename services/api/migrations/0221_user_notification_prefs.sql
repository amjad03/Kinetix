-- Mobile apps pass: each person's own notification settings (on top of the institution's switches). A kind turned
-- off here still reaches the in-app inbox but sends no push; quiet hours hold pushes back (the inbox still gets
-- them). Emergencies and the institution's urgent notices ignore both.
CREATE TABLE IF NOT EXISTS "user_notification_prefs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "push_off" text[] DEFAULT '{}'::text[] NOT NULL,
  "quiet_start" text,
  "quiet_end" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "user_notification_prefs_quiet_ck" CHECK (("quiet_start" IS NULL) = ("quiet_end" IS NULL)),
  CONSTRAINT "user_notification_prefs_time_ck" CHECK ("quiet_start" IS NULL OR ("quiet_start" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "quiet_end" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_notification_prefs_user_uq" ON "user_notification_prefs" ("user_id");
--> statement-breakpoint
ALTER TABLE "user_notification_prefs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "user_notification_prefs";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "user_notification_prefs"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "user_notification_prefs" TO zynetix_app;
  END IF;
END $$;
