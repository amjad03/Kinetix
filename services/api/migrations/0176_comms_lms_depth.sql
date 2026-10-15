-- Communication and LMS depth.
-- Communication: numbers and addresses that must not be messaged (DND, bounced, opted out), recurring campaigns,
-- and group chats tied to a class or club with quiet hours and an admins-only posting switch.
-- LMS: assignment late policy, marks, resubmission, groups and per-student extensions; release dates,
-- prerequisites and remedial audiences on course items, item progress; quizzes drawn from a question pool,
-- with attempts and coding questions.

CREATE TABLE IF NOT EXISTS "contact_suppressions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "channel" text NOT NULL,
  "address" text NOT NULL,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "reason" text DEFAULT 'dnd' NOT NULL,
  "note" text DEFAULT '' NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "contact_suppressions_uq" ON "contact_suppressions" ("tenant_id", "channel", lower("address"));--> statement-breakpoint

ALTER TABLE "message_campaigns" ADD COLUMN IF NOT EXISTS "repeat" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "message_campaigns" ADD COLUMN IF NOT EXISTS "repeat_until" date;--> statement-breakpoint
ALTER TABLE "message_campaigns" ADD COLUMN IF NOT EXISTS "parent_campaign_id" uuid REFERENCES "message_campaigns"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "message_campaigns" ADD COLUMN IF NOT EXISTS "suppressed_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint

ALTER TABLE "chat_threads" ADD COLUMN IF NOT EXISTS "linked_kind" text;--> statement-breakpoint
ALTER TABLE "chat_threads" ADD COLUMN IF NOT EXISTS "linked_id" uuid;--> statement-breakpoint
ALTER TABLE "chat_threads" ADD COLUMN IF NOT EXISTS "post_policy" text DEFAULT 'all' NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_threads" ADD COLUMN IF NOT EXISTS "quiet_start" text;--> statement-breakpoint
ALTER TABLE "chat_threads" ADD COLUMN IF NOT EXISTS "quiet_end" text;--> statement-breakpoint

ALTER TABLE "homework" ADD COLUMN IF NOT EXISTS "max_marks" numeric(6, 2);--> statement-breakpoint
ALTER TABLE "homework" ADD COLUMN IF NOT EXISTS "late_policy" text DEFAULT 'accept' NOT NULL;--> statement-breakpoint
ALTER TABLE "homework" ADD COLUMN IF NOT EXISTS "late_penalty_pct" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "homework" ADD COLUMN IF NOT EXISTS "cutoff_on" date;--> statement-breakpoint
ALTER TABLE "homework" ADD COLUMN IF NOT EXISTS "max_attempts" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "homework" ADD COLUMN IF NOT EXISTS "rubric_id" uuid;--> statement-breakpoint
ALTER TABLE "homework" ADD COLUMN IF NOT EXISTS "group_mode" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "homework" ADD COLUMN IF NOT EXISTS "pushed_assessment_id" uuid;--> statement-breakpoint
ALTER TABLE "homework_submissions" ADD COLUMN IF NOT EXISTS "marks" numeric(6, 2);--> statement-breakpoint
ALTER TABLE "homework_submissions" ADD COLUMN IF NOT EXISTS "late" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "homework_submissions" ADD COLUMN IF NOT EXISTS "penalty_pct" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "homework_submissions" ADD COLUMN IF NOT EXISTS "attempts" integer DEFAULT 1 NOT NULL;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "homework_extensions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "homework_id" uuid NOT NULL REFERENCES "homework"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "due_on" date NOT NULL,
  "reason" text DEFAULT '' NOT NULL,
  "granted_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "homework_extensions_uq" ON "homework_extensions" ("homework_id", "student_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "homework_groups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "homework_id" uuid NOT NULL REFERENCES "homework"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "student_ids" uuid[] DEFAULT '{}' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "homework_groups_homework_idx" ON "homework_groups" ("homework_id");--> statement-breakpoint

ALTER TABLE "lms_items" ADD COLUMN IF NOT EXISTS "release_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lms_items" ADD COLUMN IF NOT EXISTS "prerequisite_item_id" uuid REFERENCES "lms_items"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "lms_items" ADD COLUMN IF NOT EXISTS "audience_student_ids" uuid[];--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "lms_item_progress" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "item_id" uuid NOT NULL REFERENCES "lms_items"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "views" integer DEFAULT 1 NOT NULL,
  "first_viewed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_viewed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lms_item_progress_uq" ON "lms_item_progress" ("item_id", "student_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "lms_quizzes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "section_id" uuid NOT NULL REFERENCES "sections"("id"),
  "subject_id" uuid NOT NULL REFERENCES "subjects"("id"),
  "title" text NOT NULL,
  "instructions" text DEFAULT '' NOT NULL,
  "opens_at" timestamp with time zone NOT NULL,
  "closes_at" timestamp with time zone NOT NULL,
  "duration_min" integer DEFAULT 30 NOT NULL,
  "max_attempts" integer DEFAULT 1 NOT NULL,
  "draw_count" integer,
  "shuffle" boolean DEFAULT true NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lms_quizzes_section_idx" ON "lms_quizzes" ("section_id", "opens_at");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "lms_quiz_questions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "quiz_id" uuid NOT NULL REFERENCES "lms_quizzes"("id") ON DELETE CASCADE,
  "position" integer DEFAULT 0 NOT NULL,
  "qb_question_id" uuid,
  "kind" text DEFAULT 'mcq' NOT NULL,
  "text" text NOT NULL,
  "options" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "answer" text DEFAULT '' NOT NULL,
  "marks" numeric(6, 2) DEFAULT 1 NOT NULL,
  "language" text,
  "tests" jsonb DEFAULT '[]'::jsonb NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lms_quiz_questions_quiz_idx" ON "lms_quiz_questions" ("quiz_id", "position");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "lms_quiz_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "quiz_id" uuid NOT NULL REFERENCES "lms_quizzes"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "attempt_no" integer DEFAULT 1 NOT NULL,
  "question_ids" uuid[] DEFAULT '{}' NOT NULL,
  "answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "results" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "score" numeric(7, 2),
  "max_score" numeric(7, 2),
  "needs_marking" boolean DEFAULT false NOT NULL,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "due_at" timestamp with time zone NOT NULL,
  "submitted_at" timestamp with time zone
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lms_quiz_attempts_uq" ON "lms_quiz_attempts" ("quiz_id", "student_id", "attempt_no");--> statement-breakpoint

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['contact_suppressions', 'homework_extensions', 'homework_groups', 'lms_item_progress', 'lms_quizzes', 'lms_quiz_questions', 'lms_quiz_attempts'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)
         WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO zynetix_app', t);
    END IF;
  END LOOP;
END $$;
