-- Report studio: folders, sharing and favourites for saved reports, and richer report schedules (XLSX, people by role, run options, failure tracking).
ALTER TABLE "custom_reports" ADD COLUMN IF NOT EXISTS "folder" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "custom_reports" ADD COLUMN IF NOT EXISTS "shared_roles" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "custom_reports" ADD COLUMN IF NOT EXISTS "source_library_key" text;--> statement-breakpoint
ALTER TABLE "custom_reports" ADD COLUMN IF NOT EXISTS "last_run_at" timestamp with time zone;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "report_favourites" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "report_ref" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "report_favourites_uq" ON "report_favourites" ("tenant_id", "user_id", "report_ref");--> statement-breakpoint
ALTER TABLE "report_favourites" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "report_favourites";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "report_favourites"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "report_favourites" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "report_schedules" ADD COLUMN IF NOT EXISTS "name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "report_schedules" ADD COLUMN IF NOT EXISTS "recipient_roles" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "report_schedules" ADD COLUMN IF NOT EXISTS "recipient_user_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "report_schedules" ADD COLUMN IF NOT EXISTS "options" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "report_schedules" ADD COLUMN IF NOT EXISTS "last_status" text;--> statement-breakpoint
ALTER TABLE "report_schedules" ADD COLUMN IF NOT EXISTS "last_error" text;--> statement-breakpoint
ALTER TABLE "report_schedules" ADD COLUMN IF NOT EXISTS "failure_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "report_schedules" DROP CONSTRAINT IF EXISTS "report_schedules_format_ck";--> statement-breakpoint
ALTER TABLE "report_schedules" ADD CONSTRAINT "report_schedules_format_ck" CHECK (format IN ('csv', 'pdf', 'xlsx'));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "report_runs_schedule_idx" ON "report_runs" ("schedule_id", "created_at" DESC);
