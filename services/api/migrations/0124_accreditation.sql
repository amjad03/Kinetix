-- Accreditation and statutory reporting: metric entries, DVV queries, IQAC workspace, faculty evidence.
CREATE TABLE IF NOT EXISTS "accreditation_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "body" text NOT NULL,
  "cycle" text NOT NULL,
  "metric_code" text NOT NULL,
  "value" numeric(16,4),
  "text_value" text DEFAULT '' NOT NULL,
  "data_rows" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "self_score" numeric(4,2),
  "note" text DEFAULT '' NOT NULL,
  "updated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dvv_queries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "cycle" text NOT NULL,
  "metric_code" text NOT NULL,
  "query" text NOT NULL,
  "response" text DEFAULT '' NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "raised_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "answered_at" timestamp with time zone
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "iqac_meetings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "meeting_on" date NOT NULL,
  "agenda" text DEFAULT '' NOT NULL,
  "minutes" text DEFAULT '' NOT NULL,
  "attendees" text DEFAULT '' NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "iqac_actions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "meeting_id" uuid NOT NULL REFERENCES "iqac_meetings"("id") ON DELETE CASCADE,
  "action" text NOT NULL,
  "owner_name" text DEFAULT '' NOT NULL,
  "due_on" date,
  "status" text DEFAULT 'open' NOT NULL,
  "action_taken" text DEFAULT '' NOT NULL,
  "closed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "iqac_practices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "title" text NOT NULL,
  "year" text DEFAULT '' NOT NULL,
  "objectives" text DEFAULT '' NOT NULL,
  "context" text DEFAULT '' NOT NULL,
  "practice" text DEFAULT '' NOT NULL,
  "evidence" text DEFAULT '' NOT NULL,
  "problems" text DEFAULT '' NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "iqac_feedback_reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "cycle" text NOT NULL,
  "stakeholder" text NOT NULL,
  "summary" text NOT NULL,
  "average_rating" numeric(4,2),
  "responses" smallint,
  "action_taken" text DEFAULT '' NOT NULL,
  "status" text DEFAULT 'analysed' NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "faculty_evidence" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "title" text NOT NULL,
  "year" smallint,
  "venue" text DEFAULT '' NOT NULL,
  "url" text,
  "file_key" text,
  "file_name" text,
  "verified" boolean DEFAULT false NOT NULL,
  "verified_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "accreditation_entries_uq" ON "accreditation_entries" ("tenant_id", "body", "cycle", "metric_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dvv_queries_cycle_idx" ON "dvv_queries" ("cycle", "metric_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "iqac_actions_meeting_idx" ON "iqac_actions" ("meeting_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "faculty_evidence_user_idx" ON "faculty_evidence" ("user_id");--> statement-breakpoint
ALTER TABLE "accreditation_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "accreditation_entries";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "accreditation_entries"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "accreditation_entries" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "dvv_queries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "dvv_queries";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "dvv_queries"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "dvv_queries" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "iqac_meetings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "iqac_meetings";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "iqac_meetings"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "iqac_meetings" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "iqac_actions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "iqac_actions";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "iqac_actions"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "iqac_actions" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "iqac_practices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "iqac_practices";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "iqac_practices"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "iqac_practices" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "iqac_feedback_reports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "iqac_feedback_reports";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "iqac_feedback_reports"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "iqac_feedback_reports" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "faculty_evidence" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "faculty_evidence";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "faculty_evidence"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "faculty_evidence" TO kinetix_app;
  END IF;
END $$;
