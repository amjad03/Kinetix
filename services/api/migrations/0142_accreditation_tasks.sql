-- Accreditation readiness: metric and criterion assignment to departments and faculty with due dates, review status and
-- reminders, and comments on metrics.
CREATE TABLE IF NOT EXISTS "accreditation_tasks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "framework" text NOT NULL,
  "cycle" text NOT NULL,
  "scope" text NOT NULL,
  "department_id" uuid REFERENCES "departments"("id") ON DELETE SET NULL,
  "owner_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "reviewer_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "due_on" date,
  "status" text DEFAULT 'assigned' NOT NULL,
  "note" text DEFAULT '' NOT NULL,
  "last_reminded_on" date,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "accreditation_tasks_uq" ON "accreditation_tasks" ("tenant_id", "framework", "cycle", "scope");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "accreditation_tasks_owner_idx" ON "accreditation_tasks" ("owner_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "accreditation_comments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "framework" text NOT NULL,
  "cycle" text NOT NULL,
  "metric_code" text NOT NULL,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "body" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "accreditation_comments_metric_idx" ON "accreditation_comments" ("framework", "cycle", "metric_code");--> statement-breakpoint
ALTER TABLE "accreditation_tasks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "accreditation_tasks";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "accreditation_tasks"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "accreditation_tasks" TO zynetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "accreditation_comments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "accreditation_comments";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "accreditation_comments"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "accreditation_comments" TO zynetix_app;
  END IF;
END $$;
