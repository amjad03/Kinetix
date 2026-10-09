-- New roles, on-screen evaluation annotations and header masking, delegated approvals, DPDP data-principal requests, alumni portal link.
ALTER TYPE "public"."role_name" ADD VALUE IF NOT EXISTS 'exam_controller';--> statement-breakpoint
ALTER TYPE "public"."role_name" ADD VALUE IF NOT EXISTS 'examiner';--> statement-breakpoint
ALTER TYPE "public"."role_name" ADD VALUE IF NOT EXISTS 'quality_officer';--> statement-breakpoint
ALTER TYPE "public"."role_name" ADD VALUE IF NOT EXISTS 'alumni';--> statement-breakpoint
ALTER TABLE "eval_configs" ADD COLUMN IF NOT EXISTS "mask_header_percent" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_scripts" ADD COLUMN IF NOT EXISTS "header_masked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "alumni_profiles" ADD COLUMN IF NOT EXISTS "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "alumni_profiles_user_uq" ON "alumni_profiles" ("tenant_id", "user_id") WHERE "user_id" IS NOT NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "eval_annotations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "script_id" uuid NOT NULL REFERENCES "eval_scripts"("id") ON DELETE CASCADE,
  "allocation_id" uuid NOT NULL REFERENCES "eval_allocations"("id") ON DELETE CASCADE,
  "page_index" smallint NOT NULL,
  "kind" text NOT NULL,
  "x" numeric(7,6) NOT NULL,
  "y" numeric(7,6) NOT NULL,
  "w" numeric(7,6) DEFAULT 0 NOT NULL,
  "h" numeric(7,6) DEFAULT 0 NOT NULL,
  "text" text,
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "eval_annotations_alloc_idx" ON "eval_annotations" ("allocation_id", "page_index");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "eval_annotations_script_idx" ON "eval_annotations" ("script_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "approval_delegations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "delegator_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "delegate_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "scope" text DEFAULT 'all' NOT NULL,
  "starts_on" date NOT NULL,
  "ends_on" date NOT NULL,
  "reason" text DEFAULT '' NOT NULL,
  "revoked_at" timestamp with time zone,
  "revoked_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "approval_delegations_delegate_idx" ON "approval_delegations" ("tenant_id", "delegate_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "approval_delegations_delegator_idx" ON "approval_delegations" ("tenant_id", "delegator_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dpdp_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "details" text DEFAULT '' NOT NULL,
  "correction" jsonb,
  "resolution_note" text,
  "retention_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "processed_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "processed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dpdp_requests_status_idx" ON "dpdp_requests" ("tenant_id", "status", "created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dpdp_requests_user_idx" ON "dpdp_requests" ("tenant_id", "user_id");--> statement-breakpoint
ALTER TABLE "eval_annotations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "eval_annotations";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "eval_annotations"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "approval_delegations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "approval_delegations";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "approval_delegations"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "dpdp_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "dpdp_requests";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "dpdp_requests"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "eval_annotations", "approval_delegations", "dpdp_requests" TO kinetix_app;
  END IF;
END $$;
