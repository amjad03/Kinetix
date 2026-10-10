-- Board profile: training requests, class notes, student buzzer.
CREATE TABLE IF NOT EXISTS "training_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "requested_by" uuid NOT NULL REFERENCES "users"("id"),
  "device_id" uuid REFERENCES "devices"("id") ON DELETE SET NULL,
  "slot_at" timestamp with time zone NOT NULL,
  "topic" text NOT NULL,
  "notes" text DEFAULT '' NOT NULL,
  "status" text DEFAULT 'requested' NOT NULL,
  "admin_note" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "training_requests_status_idx" ON "training_requests" ("tenant_id","status","slot_at");--> statement-breakpoint
ALTER TABLE "training_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "training_requests";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "training_requests"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "training_requests" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "class_notes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "board_session_id" uuid NOT NULL REFERENCES "board_sessions"("id"),
  "teacher_id" uuid NOT NULL REFERENCES "users"("id"),
  "section_id" uuid REFERENCES "sections"("id"),
  "subject_id" uuid REFERENCES "subjects"("id"),
  "title" text NOT NULL,
  "notes" text NOT NULL,
  "summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "published_at" timestamp with time zone,
  "share_token" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "class_notes_session_uq" ON "class_notes" ("board_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "class_notes_token_uq" ON "class_notes" ("share_token");--> statement-breakpoint
ALTER TABLE "class_notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "class_notes";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "class_notes"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "class_notes" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "buzzer_rounds" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "board_session_id" uuid NOT NULL REFERENCES "board_sessions"("id"),
  "round_no" integer DEFAULT 1 NOT NULL,
  "locked" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "buzzer_rounds_session_uq" ON "buzzer_rounds" ("board_session_id");--> statement-breakpoint
ALTER TABLE "buzzer_rounds" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "buzzer_rounds";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "buzzer_rounds"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "buzzer_rounds" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "buzzer_presses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "board_session_id" uuid NOT NULL REFERENCES "board_sessions"("id"),
  "round_no" integer NOT NULL,
  "student_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "seq" integer NOT NULL,
  "pressed_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "buzzer_presses_uq" ON "buzzer_presses" ("board_session_id","round_no","student_user_id");--> statement-breakpoint
ALTER TABLE "buzzer_presses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "buzzer_presses";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "buzzer_presses"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "buzzer_presses" TO kinetix_app;
  END IF;
END $$;
