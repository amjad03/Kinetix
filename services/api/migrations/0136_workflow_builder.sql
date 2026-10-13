-- Visual workflow builder: module, the builder graph (published and draft), notify rules and the published version.
ALTER TABLE "workflow_definitions" ADD COLUMN IF NOT EXISTS "module" text DEFAULT 'general' NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_definitions" ADD COLUMN IF NOT EXISTS "graph" jsonb;--> statement-breakpoint
ALTER TABLE "workflow_definitions" ADD COLUMN IF NOT EXISTS "draft" jsonb;--> statement-breakpoint
ALTER TABLE "workflow_definitions" ADD COLUMN IF NOT EXISTS "notify_rules" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_definitions" ADD COLUMN IF NOT EXISTS "published_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_definitions" ADD COLUMN IF NOT EXISTS "published_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_requests_definition_idx" ON "workflow_requests" ("tenant_id", "definition_id", "created_at");
