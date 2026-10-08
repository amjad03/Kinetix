-- Workflow / e-governance engine: definitions per request type, requests moving through approval steps, and their timeline.
CREATE TABLE IF NOT EXISTS "workflow_definitions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "request_type" text NOT NULL,
  "name" text NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "version" integer DEFAULT 0 NOT NULL,
  "created_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "workflow_definitions_type_uq" ON "workflow_definitions" ("tenant_id", "request_type");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workflow_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "definition_id" uuid NOT NULL REFERENCES "workflow_definitions"("id"),
  "request_type" text NOT NULL,
  "title" text NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "amount" numeric(14, 2),
  "requester_id" uuid NOT NULL REFERENCES "users"("id"),
  "status" text DEFAULT 'pending' NOT NULL,
  "steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "current_step" integer DEFAULT 0 NOT NULL,
  "approver_user_id" uuid REFERENCES "users"("id"),
  "approver_role" text,
  "task_id" uuid REFERENCES "tasks"("id"),
  "source_module" text,
  "source_id" text,
  "decided_at" timestamp with time zone,
  "version" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "workflow_requests_status_ck" CHECK (status IN ('pending', 'approved', 'rejected', 'returned', 'cancelled'))
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_requests_requester_idx" ON "workflow_requests" ("tenant_id", "requester_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_requests_inbox_idx" ON "workflow_requests" ("tenant_id", "status", "approver_user_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workflow_actions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "seq" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "request_id" uuid NOT NULL REFERENCES "workflow_requests"("id") ON DELETE CASCADE,
  "step_index" integer,
  "step_name" text,
  "actor_id" uuid REFERENCES "users"("id"),
  "action" text NOT NULL,
  "comment" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "workflow_actions_action_ck" CHECK (action IN ('submitted', 'approved', 'rejected', 'returned', 'resubmitted', 'cancelled', 'skipped'))
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_actions_request_idx" ON "workflow_actions" ("request_id", "created_at");--> statement-breakpoint
ALTER TABLE "workflow_definitions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "workflow_definitions";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "workflow_definitions"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "workflow_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "workflow_requests";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "workflow_requests"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "workflow_actions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "workflow_actions";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "workflow_actions"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "workflow_definitions", "workflow_requests", "workflow_actions" TO kinetix_app;
  END IF;
END $$;
