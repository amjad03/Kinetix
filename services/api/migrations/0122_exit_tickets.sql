-- Exit tickets: a short set of class questions (polls) asked at the end of a lesson and kept as one record.
CREATE TABLE IF NOT EXISTS "exit_tickets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "board_session_id" uuid NOT NULL REFERENCES "board_sessions"("id"),
  "section_id" uuid NOT NULL REFERENCES "sections"("id"),
  "subject_id" uuid REFERENCES "subjects"("id"),
  "teacher_id" uuid NOT NULL REFERENCES "users"("id"),
  "topic" text NOT NULL,
  "poll_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "closed_at" timestamp with time zone
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exit_tickets_section_idx" ON "exit_tickets" ("section_id", "created_at");--> statement-breakpoint
ALTER TABLE "exit_tickets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "exit_tickets";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "exit_tickets"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "exit_tickets" TO kinetix_app;
  END IF;
END $$;
