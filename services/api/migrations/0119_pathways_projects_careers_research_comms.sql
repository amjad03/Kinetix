-- Projects workspace, impact frameworks, careers (resume, aptitude, mock interviews, AI assistant), internship attendance and outcomes,
-- thesis/viva/datasets, alumni stories, club/committee/event extras, grievance and discipline evidence, retention rules,
-- communication engine and parent visibility. Survey cycles and conditional questions are columns on the survey tables.
ALTER TABLE "surveys" ADD COLUMN IF NOT EXISTS "series_key" text;--> statement-breakpoint
ALTER TABLE "surveys" ADD COLUMN IF NOT EXISTS "repeat_every_days" smallint;--> statement-breakpoint
ALTER TABLE "surveys" ADD COLUMN IF NOT EXISTS "auto_publish" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "survey_questions" ADD COLUMN IF NOT EXISTS "show_if" jsonb;--> statement-breakpoint
ALTER TYPE "ai_task" ADD VALUE IF NOT EXISTS 'careerCoach';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_files" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "project_id" uuid NOT NULL REFERENCES "research_projects"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "kind" text DEFAULT 'file' NOT NULL,
  "url" text,
  "storage_key" text,
  "content_type" text,
  "size_bytes" integer,
  "uploaded_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_files_project_idx" ON "project_files" ("project_id");--> statement-breakpoint
ALTER TABLE "project_files" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "project_files";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "project_files"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "project_files" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_comments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "project_id" uuid NOT NULL REFERENCES "research_projects"("id") ON DELETE CASCADE,
  "author_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "parent_id" uuid,
  "body" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_comments_project_idx" ON "project_comments" ("project_id", "created_at");--> statement-breakpoint
ALTER TABLE "project_comments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "project_comments";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "project_comments"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "project_comments" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_reviews" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "project_id" uuid NOT NULL REFERENCES "research_projects"("id") ON DELETE CASCADE,
  "reviewer_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "kind" text DEFAULT 'mentor' NOT NULL,
  "rubric" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "max_per_criterion" smallint DEFAULT 5 NOT NULL,
  "total" numeric(6, 2) NOT NULL,
  "percent" numeric(5, 2) NOT NULL,
  "comment" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_reviews_project_idx" ON "project_reviews" ("project_id");--> statement-breakpoint
ALTER TABLE "project_reviews" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "project_reviews";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "project_reviews"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "project_reviews" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_vivas" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "project_id" uuid NOT NULL REFERENCES "research_projects"("id") ON DELETE CASCADE,
  "scheduled_at" timestamp with time zone NOT NULL,
  "venue" text DEFAULT '' NOT NULL,
  "panel" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "status" text DEFAULT 'scheduled' NOT NULL,
  "outcome" text,
  "score" numeric(5, 2),
  "remarks" text,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_vivas_project_idx" ON "project_vivas" ("project_id");--> statement-breakpoint
ALTER TABLE "project_vivas" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "project_vivas";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "project_vivas"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "project_vivas" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "portfolio_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "project_id" uuid REFERENCES "research_projects"("id") ON DELETE SET NULL,
  "title" text NOT NULL,
  "summary" text DEFAULT '' NOT NULL,
  "url" text,
  "kind" text DEFAULT 'project' NOT NULL,
  "published" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portfolio_items_student_idx" ON "portfolio_items" ("student_id");--> statement-breakpoint
ALTER TABLE "portfolio_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "portfolio_items";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "portfolio_items"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "portfolio_items" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_hub" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "project_id" uuid NOT NULL REFERENCES "research_projects"("id") ON DELETE CASCADE,
  "showcase" boolean DEFAULT false NOT NULL,
  "summary" text DEFAULT '' NOT NULL,
  "recruiting" boolean DEFAULT false NOT NULL,
  "looking_for" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "openings" smallint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "project_hub_project_uq" ON "project_hub" ("project_id");--> statement-breakpoint
ALTER TABLE "project_hub" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "project_hub";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "project_hub"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "project_hub" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_join_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "project_id" uuid NOT NULL REFERENCES "research_projects"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "message" text DEFAULT '' NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "decided_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "decided_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "project_join_requests_uq" ON "project_join_requests" ("project_id", "student_id");--> statement-breakpoint
ALTER TABLE "project_join_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "project_join_requests";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "project_join_requests"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "project_join_requests" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "impact_frameworks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "indicators" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "impact_frameworks_code_uq" ON "impact_frameworks" ("tenant_id", "code");--> statement-breakpoint
ALTER TABLE "impact_frameworks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "impact_frameworks";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "impact_frameworks"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "impact_frameworks" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "impact_records" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "framework_id" uuid NOT NULL REFERENCES "impact_frameworks"("id") ON DELETE CASCADE,
  "indicator_code" text NOT NULL,
  "subject_kind" text NOT NULL,
  "subject_ref" text DEFAULT '' NOT NULL,
  "quantity" numeric(12, 2) NOT NULL,
  "note" text DEFAULT '' NOT NULL,
  "recorded_on" date NOT NULL,
  "recorded_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "impact_records_framework_idx" ON "impact_records" ("framework_id", "indicator_code");--> statement-breakpoint
ALTER TABLE "impact_records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "impact_records";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "impact_records"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "impact_records" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "student_resumes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "headline" text DEFAULT '' NOT NULL,
  "summary" text DEFAULT '' NOT NULL,
  "education" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "experience" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "projects" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "interests" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "links" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "visible_to_recruiters" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "student_resumes_student_uq" ON "student_resumes" ("student_id");--> statement-breakpoint
ALTER TABLE "student_resumes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "student_resumes";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "student_resumes"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "student_resumes" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "aptitude_tests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "category" text DEFAULT 'mixed' NOT NULL,
  "duration_min" smallint DEFAULT 30 NOT NULL,
  "pass_percent" smallint DEFAULT 40 NOT NULL,
  "questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "drive_id" uuid REFERENCES "placement_drives"("id") ON DELETE SET NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "aptitude_tests_drive_idx" ON "aptitude_tests" ("drive_id");--> statement-breakpoint
ALTER TABLE "aptitude_tests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "aptitude_tests";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "aptitude_tests"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "aptitude_tests" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "aptitude_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "test_id" uuid NOT NULL REFERENCES "aptitude_tests"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "answers" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "score" integer DEFAULT 0 NOT NULL,
  "total" integer DEFAULT 0 NOT NULL,
  "percent" numeric(5, 2) DEFAULT 0 NOT NULL,
  "passed" boolean DEFAULT false NOT NULL,
  "topic_scores" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "submitted_at" timestamp with time zone
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "aptitude_attempts_test_idx" ON "aptitude_attempts" ("test_id", "student_id");--> statement-breakpoint
ALTER TABLE "aptitude_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "aptitude_attempts";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "aptitude_attempts"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "aptitude_attempts" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "career_paths" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "family" text DEFAULT '' NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "required_skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "roles" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "career_paths_title_uq" ON "career_paths" ("tenant_id", "title");--> statement-breakpoint
ALTER TABLE "career_paths" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "career_paths";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "career_paths"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "career_paths" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mock_interviews" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "kind" text DEFAULT 'hr' NOT NULL,
  "role" text DEFAULT '' NOT NULL,
  "questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "answers" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "feedback" jsonb,
  "score" numeric(5, 2),
  "status" text DEFAULT 'in_progress' NOT NULL,
  "ai_used" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mock_interviews_student_idx" ON "mock_interviews" ("student_id");--> statement-breakpoint
ALTER TABLE "mock_interviews" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "mock_interviews";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "mock_interviews"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "mock_interviews" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "career_assistant_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "role" text NOT NULL,
  "body" text NOT NULL,
  "ai_used" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "career_assistant_student_idx" ON "career_assistant_messages" ("student_id", "created_at");--> statement-breakpoint
ALTER TABLE "career_assistant_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "career_assistant_messages";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "career_assistant_messages"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "career_assistant_messages" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "internship_attendance" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "internship_id" uuid NOT NULL REFERENCES "internships"("id") ON DELETE CASCADE,
  "on_date" date NOT NULL,
  "present" boolean DEFAULT true NOT NULL,
  "hours" numeric(4, 1) DEFAULT 8 NOT NULL,
  "note" text DEFAULT '' NOT NULL,
  "marked_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "internship_attendance_uq" ON "internship_attendance" ("internship_id", "on_date");--> statement-breakpoint
ALTER TABLE "internship_attendance" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "internship_attendance";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "internship_attendance"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "internship_attendance" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "internship_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "internship_id" uuid NOT NULL REFERENCES "internships"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "skill_id" uuid REFERENCES "skills"("id") ON DELETE CASCADE,
  "subject_id" uuid REFERENCES "subjects"("id") ON DELETE CASCADE,
  "course_outcome_id" uuid REFERENCES "course_outcomes"("id") ON DELETE CASCADE,
  "note" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "internship_links_internship_idx" ON "internship_links" ("internship_id");--> statement-breakpoint
ALTER TABLE "internship_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "internship_links";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "internship_links"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "internship_links" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "internship_certificates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "internship_id" uuid NOT NULL REFERENCES "internships"("id") ON DELETE CASCADE,
  "certificate_id" uuid NOT NULL REFERENCES "certificates"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "internship_certificates_uq" ON "internship_certificates" ("internship_id");--> statement-breakpoint
ALTER TABLE "internship_certificates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "internship_certificates";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "internship_certificates"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "internship_certificates" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "supervisor_capacity" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "max_scholars" smallint DEFAULT 8 NOT NULL,
  "areas" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "supervisor_capacity_uq" ON "supervisor_capacity" ("tenant_id", "user_id");--> statement-breakpoint
ALTER TABLE "supervisor_capacity" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "supervisor_capacity";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "supervisor_capacity"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "supervisor_capacity" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "supervisor_allocations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "scholar_id" uuid NOT NULL REFERENCES "research_scholars"("id") ON DELETE CASCADE,
  "supervisor_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" text DEFAULT 'supervisor' NOT NULL,
  "allocated_on" date NOT NULL,
  "ended_on" date,
  "reason" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "supervisor_allocations_scholar_idx" ON "supervisor_allocations" ("scholar_id");--> statement-breakpoint
ALTER TABLE "supervisor_allocations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "supervisor_allocations";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "supervisor_allocations"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "supervisor_allocations" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "thesis_records" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "scholar_id" uuid NOT NULL REFERENCES "research_scholars"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "stage" text DEFAULT 'synopsis' NOT NULL,
  "abstract" text DEFAULT '' NOT NULL,
  "content_text" text DEFAULT '' NOT NULL,
  "submitted_on" date,
  "examiners" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "version" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "thesis_records_scholar_uq" ON "thesis_records" ("scholar_id");--> statement-breakpoint
ALTER TABLE "thesis_records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "thesis_records";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "thesis_records"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "thesis_records" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "thesis_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "thesis_id" uuid NOT NULL REFERENCES "thesis_records"("id") ON DELETE CASCADE,
  "stage" text NOT NULL,
  "note" text DEFAULT '' NOT NULL,
  "actor_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "thesis_events_thesis_idx" ON "thesis_events" ("thesis_id");--> statement-breakpoint
ALTER TABLE "thesis_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "thesis_events";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "thesis_events"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "thesis_events" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "thesis_vivas" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "thesis_id" uuid NOT NULL REFERENCES "thesis_records"("id") ON DELETE CASCADE,
  "kind" text DEFAULT 'open_defence' NOT NULL,
  "scheduled_at" timestamp with time zone NOT NULL,
  "venue" text DEFAULT '' NOT NULL,
  "panel" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "status" text DEFAULT 'scheduled' NOT NULL,
  "outcome" text,
  "remarks" text,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "thesis_vivas_thesis_idx" ON "thesis_vivas" ("thesis_id");--> statement-breakpoint
ALTER TABLE "thesis_vivas" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "thesis_vivas";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "thesis_vivas"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "thesis_vivas" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "similarity_checks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "thesis_id" uuid NOT NULL REFERENCES "thesis_records"("id") ON DELETE CASCADE,
  "engine" text DEFAULT 'internal' NOT NULL,
  "score_percent" numeric(5, 2) NOT NULL,
  "matches" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "checked_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "similarity_checks_thesis_idx" ON "similarity_checks" ("thesis_id");--> statement-breakpoint
ALTER TABLE "similarity_checks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "similarity_checks";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "similarity_checks"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "similarity_checks" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "research_datasets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "owner_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "project_id" uuid REFERENCES "research_projects"("id") ON DELETE SET NULL,
  "license" text DEFAULT 'CC-BY-4.0' NOT NULL,
  "access" text DEFAULT 'restricted' NOT NULL,
  "embargo_until" date,
  "doi" text,
  "keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "files" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "research_datasets_owner_idx" ON "research_datasets" ("owner_user_id");--> statement-breakpoint
ALTER TABLE "research_datasets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "research_datasets";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "research_datasets"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "research_datasets" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "alumni_success_stories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "alumni_id" uuid NOT NULL REFERENCES "alumni_profiles"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "body" text NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "featured" boolean DEFAULT false NOT NULL,
  "published_at" timestamp with time zone,
  "reviewed_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "review_note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alumni_success_stories_status_idx" ON "alumni_success_stories" ("status");--> statement-breakpoint
ALTER TABLE "alumni_success_stories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "alumni_success_stories";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "alumni_success_stories"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "alumni_success_stories" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "club_office_bearers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "club_id" uuid NOT NULL REFERENCES "clubs"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "post" text NOT NULL,
  "from_on" date NOT NULL,
  "to_on" date,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "club_office_bearers_club_idx" ON "club_office_bearers" ("club_id");--> statement-breakpoint
ALTER TABLE "club_office_bearers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "club_office_bearers";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "club_office_bearers"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "club_office_bearers" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "club_achievements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "club_id" uuid NOT NULL REFERENCES "clubs"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "level" text DEFAULT 'institutional' NOT NULL,
  "position" text DEFAULT '' NOT NULL,
  "achieved_on" date NOT NULL,
  "participants" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "recorded_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "club_achievements_club_idx" ON "club_achievements" ("club_id");--> statement-breakpoint
ALTER TABLE "club_achievements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "club_achievements";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "club_achievements"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "club_achievements" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "committee_evidence" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "committee_id" uuid NOT NULL REFERENCES "committees"("id") ON DELETE CASCADE,
  "meeting_id" uuid REFERENCES "committee_meetings"("id") ON DELETE SET NULL,
  "title" text NOT NULL,
  "kind" text DEFAULT 'document' NOT NULL,
  "url" text,
  "storage_key" text,
  "content_type" text,
  "size_bytes" integer,
  "uploaded_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "committee_evidence_committee_idx" ON "committee_evidence" ("committee_id");--> statement-breakpoint
ALTER TABLE "committee_evidence" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "committee_evidence";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "committee_evidence"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "committee_evidence" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "event_media" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "event_id" uuid NOT NULL REFERENCES "campus_events"("id") ON DELETE CASCADE,
  "caption" text DEFAULT '' NOT NULL,
  "kind" text DEFAULT 'photo' NOT NULL,
  "url" text,
  "storage_key" text,
  "content_type" text,
  "size_bytes" integer,
  "approved" boolean DEFAULT false NOT NULL,
  "uploaded_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_media_event_idx" ON "event_media" ("event_id");--> statement-breakpoint
ALTER TABLE "event_media" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "event_media";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "event_media"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "event_media" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "event_certificates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "registration_id" uuid NOT NULL REFERENCES "event_registrations"("id") ON DELETE CASCADE,
  "certificate_id" uuid NOT NULL REFERENCES "certificates"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "event_certificates_uq" ON "event_certificates" ("registration_id");--> statement-breakpoint
ALTER TABLE "event_certificates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "event_certificates";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "event_certificates"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "event_certificates" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "grievance_evidence" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "ticket_id" uuid NOT NULL REFERENCES "grievance_tickets"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "content_type" text NOT NULL,
  "size_bytes" integer NOT NULL,
  "storage_key" text NOT NULL,
  "added_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "grievance_evidence_ticket_idx" ON "grievance_evidence" ("ticket_id");--> statement-breakpoint
ALTER TABLE "grievance_evidence" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "grievance_evidence";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "grievance_evidence"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "grievance_evidence" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "discipline_witnesses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "incident_id" uuid NOT NULL REFERENCES "discipline_incidents"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "role" text DEFAULT 'student' NOT NULL,
  "student_id" uuid REFERENCES "students"("id") ON DELETE SET NULL,
  "statement" text DEFAULT '' NOT NULL,
  "recorded_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discipline_witnesses_incident_idx" ON "discipline_witnesses" ("incident_id");--> statement-breakpoint
ALTER TABLE "discipline_witnesses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "discipline_witnesses";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "discipline_witnesses"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "discipline_witnesses" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "discipline_parent_contacts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "incident_id" uuid NOT NULL REFERENCES "discipline_incidents"("id") ON DELETE CASCADE,
  "guardian_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "method" text DEFAULT 'message' NOT NULL,
  "summary" text DEFAULT '' NOT NULL,
  "meeting_on" date,
  "acknowledged_at" timestamp with time zone,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discipline_parent_contacts_incident_idx" ON "discipline_parent_contacts" ("incident_id");--> statement-breakpoint
ALTER TABLE "discipline_parent_contacts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "discipline_parent_contacts";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "discipline_parent_contacts"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "discipline_parent_contacts" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "data_retention_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "target" text NOT NULL,
  "category" text DEFAULT '' NOT NULL,
  "keep_days" integer NOT NULL,
  "action" text DEFAULT 'archive' NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "last_run_at" timestamp with time zone,
  "last_affected" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "data_retention_rules_uq" ON "data_retention_rules" ("tenant_id", "target", "category");--> statement-breakpoint
ALTER TABLE "data_retention_rules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "data_retention_rules";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "data_retention_rules"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "data_retention_rules" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "message_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "key" text NOT NULL,
  "channel" text NOT NULL,
  "locale" text DEFAULT 'en' NOT NULL,
  "subject" text DEFAULT '' NOT NULL,
  "body" text NOT NULL,
  "dlt_template_id" text,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "message_templates_uq" ON "message_templates" ("tenant_id", "key", "channel", "locale");--> statement-breakpoint
ALTER TABLE "message_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "message_templates";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "message_templates"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "message_templates" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audience_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "rule" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "audience_rules_name_uq" ON "audience_rules" ("tenant_id", "name");--> statement-breakpoint
ALTER TABLE "audience_rules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "audience_rules";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "audience_rules"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "audience_rules" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "message_campaigns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "template_id" uuid NOT NULL REFERENCES "message_templates"("id") ON DELETE RESTRICT,
  "audience_id" uuid NOT NULL REFERENCES "audience_rules"("id") ON DELETE RESTRICT,
  "vars" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "send_at" timestamp with time zone NOT NULL,
  "status" text DEFAULT 'scheduled' NOT NULL,
  "recipients" integer DEFAULT 0 NOT NULL,
  "sent_count" integer DEFAULT 0 NOT NULL,
  "failed_count" integer DEFAULT 0 NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_campaigns_due_idx" ON "message_campaigns" ("status", "send_at");--> statement-breakpoint
ALTER TABLE "message_campaigns" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "message_campaigns";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "message_campaigns"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "message_campaigns" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "message_deliveries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "campaign_id" uuid NOT NULL REFERENCES "message_campaigns"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "channel" text NOT NULL,
  "status" text DEFAULT 'queued' NOT NULL,
  "attempts" smallint DEFAULT 0 NOT NULL,
  "error" text,
  "next_attempt_at" timestamp with time zone,
  "sent_at" timestamp with time zone,
  "read_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "message_deliveries_uq" ON "message_deliveries" ("campaign_id", "user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_deliveries_retry_idx" ON "message_deliveries" ("status", "next_attempt_at");--> statement-breakpoint
ALTER TABLE "message_deliveries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "message_deliveries";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "message_deliveries"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "message_deliveries" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "parent_visibility" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "section" text NOT NULL,
  "visible" boolean DEFAULT true NOT NULL,
  "updated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "parent_visibility_uq" ON "parent_visibility" ("tenant_id", "section");--> statement-breakpoint
ALTER TABLE "parent_visibility" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "parent_visibility";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "parent_visibility"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "parent_visibility" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "refund_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "payment_id" uuid NOT NULL REFERENCES "fee_payments"("id") ON DELETE CASCADE,
  "amount_paise" bigint NOT NULL,
  "reason" text NOT NULL,
  "requested_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "refund_id" uuid,
  "decided_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "refund_requests_payment_idx" ON "refund_requests" ("payment_id");--> statement-breakpoint
ALTER TABLE "refund_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "refund_requests";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "refund_requests"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "refund_requests" TO kinetix_app;
  END IF;
END $$;