-- Workflow engine: parallel and conditional steps, SLA reminders and escalation. Task escalation targets.
-- Exams: registration windows with eligibility, registrations with controller override, bench layouts for anti-collusion seating.
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "escalate_role" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "escalate_user_id" uuid REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "reminder_hours" integer;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "reminded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workflow_requests" ADD COLUMN IF NOT EXISTS "step_entered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workflow_requests" ADD COLUMN IF NOT EXISTS "reminded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workflow_requests" ADD COLUMN IF NOT EXISTS "escalated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workflow_actions" DROP CONSTRAINT IF EXISTS "workflow_actions_action_ck";--> statement-breakpoint
ALTER TABLE "workflow_actions" ADD CONSTRAINT "workflow_actions_action_ck" CHECK (action IN ('submitted', 'approved', 'rejected', 'returned', 'resubmitted', 'cancelled', 'skipped', 'reminded', 'escalated'));--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workflow_step_approvals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "request_id" uuid NOT NULL REFERENCES "workflow_requests"("id") ON DELETE CASCADE,
  "step_index" integer NOT NULL,
  "kind" text NOT NULL,
  "role" text,
  "user_id" uuid REFERENCES "users"("id"),
  "task_id" uuid REFERENCES "tasks"("id"),
  "escalation" boolean DEFAULT false NOT NULL,
  "decided_by" uuid REFERENCES "users"("id"),
  "decided_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_step_approvals_req_idx" ON "workflow_step_approvals" ("request_id", "step_index");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_step_approvals_user_idx" ON "workflow_step_approvals" ("tenant_id", "user_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "exam_registration_windows" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "session_id" uuid NOT NULL REFERENCES "exam_sessions"("id") ON DELETE CASCADE,
  "opens_on" date NOT NULL,
  "closes_on" date NOT NULL,
  "min_attendance_percent" numeric(5,2),
  "block_on_fee_dues" boolean DEFAULT true NOT NULL,
  "max_backlogs" integer,
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "exam_registration_windows_uq" ON "exam_registration_windows" ("session_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "exam_registrations" (
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "session_id" uuid NOT NULL REFERENCES "exam_sessions"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id"),
  "status" text NOT NULL,
  "reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "overridden_by" uuid REFERENCES "users"("id"),
  "override_reason" text,
  "registered_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY ("session_id", "student_id")
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "exam_room_layouts" (
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "session_id" uuid NOT NULL REFERENCES "exam_sessions"("id") ON DELETE CASCADE,
  "room_id" uuid NOT NULL REFERENCES "rooms"("id"),
  "rows" smallint NOT NULL,
  "benches_per_row" smallint NOT NULL,
  "seats_per_bench" smallint DEFAULT 2 NOT NULL,
  PRIMARY KEY ("session_id", "room_id")
);--> statement-breakpoint
ALTER TABLE "workflow_step_approvals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "workflow_step_approvals";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "workflow_step_approvals"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "exam_registration_windows" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "exam_registration_windows";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "exam_registration_windows"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "exam_registrations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "exam_registrations";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "exam_registrations"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "exam_room_layouts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "exam_room_layouts";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "exam_room_layouts"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "workflow_step_approvals", "exam_registration_windows", "exam_registrations", "exam_room_layouts" TO kinetix_app;
  END IF;
END $$;
