-- Governance (rule registry, incidents, retention, result approval), SaaS billing, AI depth (tutor, action audit,
-- evaluation harness), similarity checks, and remedial/re-measure on intervention plans.
ALTER TYPE "ai_task" ADD VALUE IF NOT EXISTS 'qualityInsight';--> statement-breakpoint
ALTER TYPE "ai_task" ADD VALUE IF NOT EXISTS 'researchInsight';--> statement-breakpoint
ALTER TYPE "ai_task" ADD VALUE IF NOT EXISTS 'careerInsight';--> statement-breakpoint
ALTER TYPE "ai_task" ADD VALUE IF NOT EXISTS 'parentInsight';--> statement-breakpoint
ALTER TYPE "ai_task" ADD VALUE IF NOT EXISTS 'tutor';--> statement-breakpoint
ALTER TABLE "exam_sessions" ADD COLUMN IF NOT EXISTS "approval_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "exam_sessions" ADD COLUMN IF NOT EXISTS "approval_requested_by" uuid REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "exam_sessions" ADD COLUMN IF NOT EXISTS "approval_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "exam_sessions" ADD COLUMN IF NOT EXISTS "approved_by" uuid REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "exam_sessions" ADD COLUMN IF NOT EXISTS "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "exam_sessions" ADD COLUMN IF NOT EXISTS "approval_note" text;--> statement-breakpoint
ALTER TABLE "vault_documents" ADD COLUMN IF NOT EXISTS "legal_hold" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "intervention_plans" ADD COLUMN IF NOT EXISTS "remedial" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "intervention_plans" ADD COLUMN IF NOT EXISTS "baseline" jsonb;--> statement-breakpoint
ALTER TABLE "intervention_plans" ADD COLUMN IF NOT EXISTS "remeasure" jsonb;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "business_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "domain" text NOT NULL,
  "key" text NOT NULL,
  "version" integer NOT NULL,
  "title" text NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "params" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "effective_from" date NOT NULL,
  "effective_to" date,
  "author_id" uuid NOT NULL REFERENCES "users"("id"),
  "approver_id" uuid REFERENCES "users"("id"),
  "approved_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "business_rules_uq" ON "business_rules" ("tenant_id", "domain", "key", "version");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "business_rules_lookup_idx" ON "business_rules" ("tenant_id", "domain", "key", "status");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "incidents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "severity" text NOT NULL,
  "category" text NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "impact" text DEFAULT '' NOT NULL,
  "detected_at" timestamp with time zone NOT NULL,
  "resolved_at" timestamp with time zone,
  "reported_by" uuid NOT NULL REFERENCES "users"("id"),
  "owner_id" uuid REFERENCES "users"("id"),
  "personal_data_involved" boolean DEFAULT false NOT NULL,
  "regulator_notified_at" timestamp with time zone,
  "root_cause" text,
  "corrective_actions" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "incidents_status_idx" ON "incidents" ("tenant_id", "status", "severity");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "incident_updates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "incident_id" uuid NOT NULL REFERENCES "incidents"("id") ON DELETE CASCADE,
  "kind" text DEFAULT 'note' NOT NULL,
  "body" text NOT NULL,
  "status_after" text,
  "author_id" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "incident_updates_incident_idx" ON "incident_updates" ("incident_id", "created_at");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "document_retention_policies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "category" text NOT NULL,
  "retain_months" integer NOT NULL,
  "note" text DEFAULT '' NOT NULL,
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "document_retention_uq" ON "document_retention_policies" ("tenant_id", "category");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "saas_subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "plan_code" text NOT NULL,
  "interval" text DEFAULT 'month' NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "started_on" date NOT NULL,
  "current_period_start" date NOT NULL,
  "current_period_end" date NOT NULL,
  "trial_ends_on" date,
  "auto_renew" boolean DEFAULT true NOT NULL,
  "billing_state_code" text DEFAULT '29' NOT NULL,
  "gstin" text,
  "cancelled_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "saas_subscriptions_tenant_uq" ON "saas_subscriptions" ("tenant_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "saas_usage_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "period_start" date NOT NULL,
  "students" integer NOT NULL,
  "staff" integer NOT NULL,
  "boards" integer NOT NULL,
  "ai_calls" integer NOT NULL,
  "storage_mb" integer NOT NULL,
  "taken_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "saas_usage_period_uq" ON "saas_usage_snapshots" ("tenant_id", "period_start");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "saas_invoices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "number" text NOT NULL,
  "period_start" date NOT NULL,
  "period_end" date NOT NULL,
  "plan_code" text NOT NULL,
  "lines" jsonb NOT NULL,
  "subtotal_paise" bigint NOT NULL,
  "tax_paise" bigint NOT NULL,
  "tax_breakdown" jsonb NOT NULL,
  "total_paise" bigint NOT NULL,
  "status" text DEFAULT 'issued' NOT NULL,
  "issued_on" date NOT NULL,
  "due_on" date NOT NULL,
  "paid_on" date,
  "payment_ref" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "saas_invoices_number_uq" ON "saas_invoices" ("tenant_id", "number");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "saas_invoices_period_uq" ON "saas_invoices" ("tenant_id", "period_start");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "ai_tutor_threads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id"),
  "subject_id" uuid REFERENCES "subjects"("id"),
  "title" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_tutor_threads_student_idx" ON "ai_tutor_threads" ("student_id", "updated_at");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "ai_tutor_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "thread_id" uuid NOT NULL REFERENCES "ai_tutor_threads"("id") ON DELETE CASCADE,
  "role" text NOT NULL,
  "content" text NOT NULL,
  "sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_tutor_messages_thread_idx" ON "ai_tutor_messages" ("thread_id", "created_at");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "ai_actions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "user_id" uuid REFERENCES "users"("id"),
  "task" text NOT NULL,
  "surface" text NOT NULL,
  "input_hash" text NOT NULL,
  "input_preview" text DEFAULT '' NOT NULL,
  "output_preview" text DEFAULT '' NOT NULL,
  "sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "provider" text DEFAULT '' NOT NULL,
  "model" text DEFAULT '' NOT NULL,
  "decision" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_actions_task_idx" ON "ai_actions" ("tenant_id", "task", "created_at");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "ai_eval_cases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "task" text NOT NULL,
  "input" jsonb NOT NULL,
  "must_include" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "must_not_include" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "max_chars" integer,
  "active" boolean DEFAULT true NOT NULL,
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ai_eval_cases_name_uq" ON "ai_eval_cases" ("tenant_id", "name");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "ai_eval_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "started_by" uuid NOT NULL REFERENCES "users"("id"),
  "provider" text NOT NULL,
  "model" text NOT NULL,
  "prompt_version" text NOT NULL,
  "passed" integer NOT NULL,
  "failed" integer NOT NULL,
  "results" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_eval_runs_idx" ON "ai_eval_runs" ("tenant_id", "created_at");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "integrity_checks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "source_kind" text NOT NULL,
  "source_id" uuid,
  "threshold" numeric(4,2) DEFAULT 0.5 NOT NULL,
  "compared" integer DEFAULT 0 NOT NULL,
  "flagged" integer DEFAULT 0 NOT NULL,
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integrity_checks_source_idx" ON "integrity_checks" ("tenant_id", "source_kind", "source_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "integrity_matches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "check_id" uuid NOT NULL REFERENCES "integrity_checks"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id"),
  "matched_student_id" uuid NOT NULL REFERENCES "students"("id"),
  "similarity" numeric(4,3) NOT NULL,
  "shared_phrase" text DEFAULT '' NOT NULL,
  "reviewed" text,
  "reviewed_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integrity_matches_check_idx" ON "integrity_matches" ("check_id", "similarity");--> statement-breakpoint

-- Row-level security and grants for every new table.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['business_rules', 'incidents', 'incident_updates', 'document_retention_policies', 'saas_subscriptions', 'saas_usage_snapshots', 'saas_invoices', 'ai_tutor_threads', 'ai_tutor_messages', 'ai_actions', 'ai_eval_cases', 'ai_eval_runs', 'integrity_checks', 'integrity_matches']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format($p$CREATE POLICY tenant_isolation ON %I USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)$p$, t);
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO kinetix_app', t);
    END IF;
  END LOOP;
END $$;
