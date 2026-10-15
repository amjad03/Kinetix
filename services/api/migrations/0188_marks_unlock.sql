-- Unlocking marks after they are submitted, verified or locked: the teacher asks, the head of department or the
-- controller of examinations decides; approval reopens the marks for editing (audited) and the teacher is told.
CREATE TABLE IF NOT EXISTS "marks_unlock_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "assessment_id" uuid NOT NULL REFERENCES "assessments"("id") ON DELETE CASCADE,
  "requested_by" uuid NOT NULL REFERENCES "users"("id"),
  "reason" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "decided_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "decided_at" timestamp with time zone,
  "decision_note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "marks_unlock_requests_status_ck" CHECK ("status" IN ('pending', 'approved', 'rejected', 'cancelled'))
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "marks_unlock_requests_assessment_idx" ON "marks_unlock_requests" ("assessment_id", "status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "marks_unlock_requests_open_uq" ON "marks_unlock_requests" ("assessment_id") WHERE "status" = 'pending';--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['marks_unlock_requests'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO zynetix_app', t);
    END IF;
  END LOOP;
END $$;
