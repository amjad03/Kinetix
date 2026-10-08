-- Surveys (PRD 53) and the task engine (PRD 69).
ALTER TYPE "public"."notification_kind" ADD VALUE IF NOT EXISTS 'survey';--> statement-breakpoint
ALTER TYPE "public"."notification_kind" ADD VALUE IF NOT EXISTS 'task';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "surveys" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "title" text NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "audience" text NOT NULL,
  "section_id" uuid REFERENCES "sections"("id"),
  "anonymous" boolean DEFAULT false NOT NULL,
  "opens_at" timestamp with time zone,
  "closes_at" timestamp with time zone,
  "status" text DEFAULT 'draft' NOT NULL,
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "closed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "surveys_audience_ck" CHECK (audience IN ('students', 'section', 'staff', 'guardians')),
  CONSTRAINT "surveys_status_ck" CHECK (status IN ('draft', 'open', 'closed'))
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "survey_questions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "survey_id" uuid NOT NULL REFERENCES "surveys"("id") ON DELETE cascade,
  "ord" smallint NOT NULL,
  "kind" text NOT NULL,
  "prompt" text NOT NULL,
  "options" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "required" boolean DEFAULT true NOT NULL,
  "co_id" uuid REFERENCES "course_outcomes"("id"),
  CONSTRAINT "survey_questions_kind_ck" CHECK (kind IN ('single', 'multiple', 'rating', 'text'))
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "survey_questions_survey_idx" ON "survey_questions" ("survey_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "survey_responses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "survey_id" uuid NOT NULL REFERENCES "surveys"("id") ON DELETE cascade,
  "respondent_id" uuid NOT NULL REFERENCES "users"("id"),
  "submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "survey_responses_once_uq" ON "survey_responses" ("survey_id", "respondent_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "survey_answers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "survey_id" uuid NOT NULL REFERENCES "surveys"("id") ON DELETE cascade,
  "question_id" uuid NOT NULL REFERENCES "survey_questions"("id") ON DELETE cascade,
  "response_id" uuid REFERENCES "survey_responses"("id"),
  "choices" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "rating" smallint,
  "text" text
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "survey_answers_question_idx" ON "survey_answers" ("question_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tasks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "title" text NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "owner_id" uuid NOT NULL REFERENCES "users"("id"),
  "assignee_id" uuid NOT NULL REFERENCES "users"("id"),
  "due_at" timestamp with time zone,
  "priority" text DEFAULT 'normal' NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "source_module" text,
  "source_id" text,
  "sla_hours" integer,
  "escalated_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "version" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "tasks_priority_ck" CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  CONSTRAINT "tasks_status_ck" CHECK (status IN ('open', 'in_progress', 'done', 'cancelled'))
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_assignee_idx" ON "tasks" ("tenant_id", "assignee_id", "status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_owner_idx" ON "tasks" ("tenant_id", "owner_id");--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['surveys', 'survey_questions', 'survey_responses', 'survey_answers', 'tasks'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO kinetix_app', t);
    END IF;
  END LOOP;
END $$;
