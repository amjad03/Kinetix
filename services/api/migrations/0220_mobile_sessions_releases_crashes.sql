-- Mobile apps pass: refresh tokens for app sign-ins (a phone stays signed in while it is used, the 12-hour access
-- token is renewed with a rotating refresh token, and a reused refresh token signs the session out), the apps'
-- minimum and latest versions per platform (forced and recommended updates), and crash reports from the apps.
ALTER TABLE "user_sessions" ADD COLUMN IF NOT EXISTS "client" text DEFAULT 'web' NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_sessions" ADD COLUMN IF NOT EXISTS "refresh_hash" text;
--> statement-breakpoint
ALTER TABLE "user_sessions" ADD COLUMN IF NOT EXISTS "refresh_prev_hash" text;
--> statement-breakpoint
ALTER TABLE "user_sessions" ADD COLUMN IF NOT EXISTS "refresh_expires_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "user_sessions" ADD COLUMN IF NOT EXISTS "refreshed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "user_sessions" DROP CONSTRAINT IF EXISTS "user_sessions_client_ck";
--> statement-breakpoint
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_client_ck" CHECK ("client" IN ('web', 'mobile'));
--> statement-breakpoint
-- A global table written only by the platform team (owner role); read by the public version check.
CREATE TABLE IF NOT EXISTS "app_releases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "app" text NOT NULL CHECK ("app" IN ('teacher', 'student', 'parent', 'board')),
  "platform" text NOT NULL CHECK ("platform" IN ('android', 'ios', 'windows')),
  "min_version" text DEFAULT '0.0.0' NOT NULL,
  "latest_version" text DEFAULT '0.0.0' NOT NULL,
  "store_url" text DEFAULT '' NOT NULL,
  "message" text DEFAULT '' NOT NULL,
  "updated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "app_releases_app_platform_uq" ON "app_releases" ("app", "platform");
--> statement-breakpoint
INSERT INTO "app_releases" ("app", "platform", "store_url") VALUES
  ('teacher', 'android', 'https://play.google.com/store/apps/details?id=in.zynetix.teacher'),
  ('teacher', 'ios', 'https://apps.apple.com/in/app/zynetix-teacher/id0000000000'),
  ('student', 'android', 'https://play.google.com/store/apps/details?id=in.zynetix.student'),
  ('student', 'ios', 'https://apps.apple.com/in/app/zynetix-student/id0000000000'),
  ('parent', 'android', 'https://play.google.com/store/apps/details?id=in.zynetix.parent'),
  ('parent', 'ios', 'https://apps.apple.com/in/app/zynetix-parent/id0000000000'),
  ('board', 'android', ''),
  ('board', 'windows', '')
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Crash reports from the apps: no names, no tokens, no request bodies (scrubbed before saving). Grouped by a
-- fingerprint of the error and the app version, so one crash on 5,000 phones is one row with a count.
CREATE TABLE IF NOT EXISTS "client_error_reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "app" text NOT NULL CHECK ("app" IN ('teacher', 'student', 'parent', 'board')),
  "platform" text NOT NULL,
  "app_version" text NOT NULL,
  "os_version" text DEFAULT '' NOT NULL,
  "kind" text NOT NULL CHECK ("kind" IN ('flutter', 'platform', 'zone', 'isolate')),
  "fatal" boolean DEFAULT false NOT NULL,
  "message" text NOT NULL,
  "stack" text DEFAULT '' NOT NULL,
  "fingerprint" text NOT NULL,
  "tenant_slug" text DEFAULT '' NOT NULL,
  "occurrences" integer DEFAULT 1 NOT NULL,
  "first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "client_error_reports_fp_uq" ON "client_error_reports" ("fingerprint", "app_version");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "client_error_reports_recent_idx" ON "client_error_reports" ("app", "last_seen_at");
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT ON "app_releases" TO zynetix_app;
  END IF;
END $$;
