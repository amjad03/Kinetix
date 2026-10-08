-- Student mentoring and early intervention, course files, and academic audit.
CREATE TABLE IF NOT EXISTS "mentor_assignments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "student_id" uuid NOT NULL REFERENCES "students"("id"),
  "mentor_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "started_on" date NOT NULL,
  "ended_on" date,
  "assigned_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mentoring_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "student_id" uuid NOT NULL REFERENCES "students"("id"),
  "mentor_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "held_on" date NOT NULL,
  "mode" text DEFAULT 'in_person' NOT NULL,
  "summary" text DEFAULT '' NOT NULL,
  "private_notes" text,
  "follow_up_on" date,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "intervention_plans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "student_id" uuid NOT NULL REFERENCES "students"("id"),
  "mentor_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "goal" text NOT NULL,
  "actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "review_on" date NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "outcome" text,
  "outcome_rating" text,
  "closed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "course_files" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "section_id" uuid NOT NULL REFERENCES "sections"("id"),
  "subject_id" uuid NOT NULL REFERENCES "subjects"("id"),
  "version" integer NOT NULL,
  "storage_key" text NOT NULL,
  "size_bytes" integer NOT NULL,
  "summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "generated_by" uuid NOT NULL REFERENCES "users"("id"),
  "generated_at" timestamp with time zone NOT NULL,
  "reviewed_by" uuid REFERENCES "users"("id"),
  "reviewed_at" timestamp with time zone,
  "review_remark" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "name" text NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_template_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "template_id" uuid NOT NULL REFERENCES "audit_templates"("id") ON DELETE CASCADE,
  "ord" smallint NOT NULL,
  "category" text DEFAULT '' NOT NULL,
  "text" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "academic_audits" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "template_id" uuid NOT NULL REFERENCES "audit_templates"("id"),
  "department_id" uuid NOT NULL REFERENCES "departments"("id"),
  "academic_term_id" uuid REFERENCES "academic_terms"("id"),
  "title" text NOT NULL,
  "status" text DEFAULT 'in_progress' NOT NULL,
  "auditor_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "conducted_on" date NOT NULL,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "academic_audit_results" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "audit_id" uuid NOT NULL REFERENCES "academic_audits"("id") ON DELETE CASCADE,
  "ord" smallint NOT NULL,
  "category" text DEFAULT '' NOT NULL,
  "item_text" text NOT NULL,
  "result" text DEFAULT 'pending' NOT NULL,
  "remark" text DEFAULT '' NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_non_conformities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "audit_id" uuid NOT NULL REFERENCES "academic_audits"("id") ON DELETE CASCADE,
  "result_id" uuid REFERENCES "academic_audit_results"("id") ON DELETE SET NULL,
  "description" text NOT NULL,
  "severity" text DEFAULT 'minor' NOT NULL,
  "corrective_action" text DEFAULT '' NOT NULL,
  "owner_user_id" uuid REFERENCES "users"("id"),
  "due_on" date,
  "status" text DEFAULT 'open' NOT NULL,
  "closure_note" text,
  "closed_by" uuid REFERENCES "users"("id"),
  "closed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mentor_assignments_open_uq" ON "mentor_assignments" ("student_id") WHERE ended_on IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mentor_assignments_mentor_idx" ON "mentor_assignments" ("mentor_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mentoring_sessions_student_idx" ON "mentoring_sessions" ("student_id", "held_on");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "intervention_plans_student_idx" ON "intervention_plans" ("student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "intervention_plans_mentor_idx" ON "intervention_plans" ("mentor_user_id", "status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "course_files_version_uq" ON "course_files" ("section_id", "subject_id", "version");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_template_items_tpl_idx" ON "audit_template_items" ("template_id", "ord");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "academic_audits_dept_idx" ON "academic_audits" ("department_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "academic_audit_results_audit_idx" ON "academic_audit_results" ("audit_id", "ord");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_ncs_audit_idx" ON "audit_non_conformities" ("audit_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_ncs_owner_idx" ON "audit_non_conformities" ("owner_user_id", "status");--> statement-breakpoint
ALTER TABLE "mentor_assignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "mentor_assignments";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "mentor_assignments"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "mentor_assignments" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "mentoring_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "mentoring_sessions";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "mentoring_sessions"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "mentoring_sessions" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "intervention_plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "intervention_plans";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "intervention_plans"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "intervention_plans" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "course_files" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "course_files";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "course_files"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "course_files" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "audit_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "audit_templates";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "audit_templates"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "audit_templates" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "audit_template_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "audit_template_items";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "audit_template_items"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "audit_template_items" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "academic_audits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "academic_audits";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "academic_audits"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "academic_audits" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "academic_audit_results" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "academic_audit_results";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "academic_audit_results"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "academic_audit_results" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "audit_non_conformities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "audit_non_conformities";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "audit_non_conformities"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "audit_non_conformities" TO kinetix_app;
  END IF;
END $$;
