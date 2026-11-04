-- LMS production pass, part 1: lesson pages and SCORM, quiz and live-class items with completion rules and
-- low-bandwidth hints; course completion rules and course prerequisites; quiz negative marking, option shuffling,
-- proctoring signals, answer review and the push to internal marks; live classes with join tracking; forum reports
-- and held posts; the plagiarism score and rubric marking on submissions; and the institution's LMS settings.
ALTER TABLE "lms_items" DROP CONSTRAINT IF EXISTS "lms_items_kind_ck";--> statement-breakpoint
ALTER TABLE "lms_items" ADD CONSTRAINT "lms_items_kind_ck" CHECK (kind IN ('topic', 'video', 'homework', 'assessment', 'file', 'link', 'worksheet', 'case_study', 'simulation', 'virtual_lab', 'ppt', 'pdf', 'page', 'scorm', 'quiz', 'live'));--> statement-breakpoint
ALTER TABLE "lms_items" ADD COLUMN IF NOT EXISTS "body" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "lms_items" ADD COLUMN IF NOT EXISTS "completion_rule" text DEFAULT 'view' NOT NULL;--> statement-breakpoint
ALTER TABLE "lms_items" ADD COLUMN IF NOT EXISTS "pass_pct" integer;--> statement-breakpoint
ALTER TABLE "lms_items" ADD COLUMN IF NOT EXISTS "duration_min" integer;--> statement-breakpoint
ALTER TABLE "lms_items" ADD COLUMN IF NOT EXISTS "size_kb" integer;--> statement-breakpoint
ALTER TABLE "lms_items" ADD COLUMN IF NOT EXISTS "offline" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "lms_items" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "lms_items" DROP CONSTRAINT IF EXISTS "lms_items_completion_ck";--> statement-breakpoint
ALTER TABLE "lms_items" ADD CONSTRAINT "lms_items_completion_ck" CHECK ("completion_rule" IN ('view', 'mark_done', 'pass') AND coalesce("pass_pct", 0) BETWEEN 0 AND 100 AND coalesce("duration_min", 0) >= 0 AND coalesce("size_kb", 0) >= 0);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lms_items_module_idx" ON "lms_items" ("module_id", "position");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lms_modules_course_idx" ON "lms_modules" ("course_id", "position");--> statement-breakpoint
ALTER TABLE "lms_courses" ADD COLUMN IF NOT EXISTS "completion_pct" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "lms_courses" ADD COLUMN IF NOT EXISTS "min_grade_pct" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "lms_courses" ADD COLUMN IF NOT EXISTS "certificate" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "lms_courses" ADD COLUMN IF NOT EXISTS "prerequisite_course_ids" uuid[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "lms_courses" DROP CONSTRAINT IF EXISTS "lms_courses_completion_ck";--> statement-breakpoint
ALTER TABLE "lms_courses" ADD CONSTRAINT "lms_courses_completion_ck" CHECK ("completion_pct" BETWEEN 1 AND 100 AND coalesce("min_grade_pct", 0) BETWEEN 0 AND 100);--> statement-breakpoint
ALTER TABLE "lms_grade_categories" DROP CONSTRAINT IF EXISTS "lms_cat_source_ck";--> statement-breakpoint
ALTER TABLE "lms_grade_categories" ADD CONSTRAINT "lms_cat_source_ck" CHECK (source IN ('homework', 'test', 'assignment', 'internal', 'exam', 'practical', 'quiz'));--> statement-breakpoint
ALTER TABLE "lms_quizzes" ADD COLUMN IF NOT EXISTS "negative_pct" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "lms_quizzes" ADD COLUMN IF NOT EXISTS "shuffle_options" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "lms_quizzes" ADD COLUMN IF NOT EXISTS "proctoring" text DEFAULT 'off' NOT NULL;--> statement-breakpoint
ALTER TABLE "lms_quizzes" ADD COLUMN IF NOT EXISTS "max_violations" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "lms_quizzes" ADD COLUMN IF NOT EXISTS "review" text DEFAULT 'after_close' NOT NULL;--> statement-breakpoint
ALTER TABLE "lms_quizzes" ADD COLUMN IF NOT EXISTS "pass_pct" integer DEFAULT 40 NOT NULL;--> statement-breakpoint
ALTER TABLE "lms_quizzes" ADD COLUMN IF NOT EXISTS "pushed_assessment_id" uuid REFERENCES "assessments"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "lms_quizzes" DROP CONSTRAINT IF EXISTS "lms_quizzes_pass_ck";--> statement-breakpoint
ALTER TABLE "lms_quizzes" ADD CONSTRAINT "lms_quizzes_pass_ck" CHECK ("negative_pct" BETWEEN 0 AND 100 AND "proctoring" IN ('off', 'record', 'strict') AND "max_violations" BETWEEN 1 AND 50 AND "review" IN ('never', 'after_submit', 'after_close') AND "pass_pct" BETWEEN 0 AND 100);--> statement-breakpoint
ALTER TABLE "lms_quiz_questions" ADD COLUMN IF NOT EXISTS "difficulty" text;--> statement-breakpoint
ALTER TABLE "lms_quiz_questions" ADD COLUMN IF NOT EXISTS "negative_marks" numeric(6, 2);--> statement-breakpoint
ALTER TABLE "lms_quiz_attempts" ADD COLUMN IF NOT EXISTS "option_orders" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "lms_quiz_attempts" ADD COLUMN IF NOT EXISTS "violations" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "lms_quiz_attempts" ADD COLUMN IF NOT EXISTS "flagged" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "lms_quiz_attempts" ADD COLUMN IF NOT EXISTS "auto_submitted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lms_quiz_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "attempt_id" uuid NOT NULL REFERENCES "lms_quiz_attempts"("id") ON DELETE CASCADE,
  "kind" text NOT NULL CHECK ("kind" IN ('tab_hidden', 'window_blur', 'fullscreen_exit', 'copy', 'paste', 'app_background', 'screenshot', 'network_change')),
  "at" timestamp with time zone NOT NULL,
  "detail" text DEFAULT '' NOT NULL CHECK (length("detail") <= 300),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lms_quiz_events_attempt_idx" ON "lms_quiz_events" ("attempt_id", "at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lms_live_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "course_id" uuid NOT NULL REFERENCES "lms_courses"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "starts_at" timestamp with time zone NOT NULL,
  "duration_min" integer NOT NULL CHECK ("duration_min" BETWEEN 5 AND 600),
  "join_url" text NOT NULL,
  "provider" text NOT NULL CHECK ("provider" IN ('meet', 'zoom', 'teams', 'jitsi', 'webex', 'other')),
  "slot_id" uuid REFERENCES "timetable_slots"("id") ON DELETE SET NULL,
  "recording_url" text,
  "status" text DEFAULT 'scheduled' NOT NULL CHECK ("status" IN ('scheduled', 'cancelled')),
  "attendance_marked_at" timestamp with time zone,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lms_live_sessions_course_idx" ON "lms_live_sessions" ("course_id", "starts_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lms_live_joins" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "session_id" uuid NOT NULL REFERENCES "lms_live_sessions"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "first_joined_at" timestamp with time zone NOT NULL,
  "last_joined_at" timestamp with time zone NOT NULL,
  "joins" integer DEFAULT 1 NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lms_live_joins_uq" ON "lms_live_joins" ("session_id", "student_id");--> statement-breakpoint
ALTER TABLE "forum_threads" ADD COLUMN IF NOT EXISTS "held" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "forum_posts" ADD COLUMN IF NOT EXISTS "held" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "forum_posts" ADD COLUMN IF NOT EXISTS "edited_at" timestamp with time zone;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "forum_reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "thread_id" uuid NOT NULL REFERENCES "forum_threads"("id") ON DELETE CASCADE,
  "post_id" uuid REFERENCES "forum_posts"("id") ON DELETE CASCADE,
  "reporter_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "reason" text NOT NULL CHECK ("reason" IN ('abusive', 'spam', 'off_topic', 'cheating', 'other')),
  "note" text DEFAULT '' NOT NULL CHECK (length("note") <= 500),
  "status" text DEFAULT 'open' NOT NULL CHECK ("status" IN ('open', 'actioned', 'dismissed')),
  "resolved_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "resolved_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "forum_reports_uq" ON "forum_reports" ("thread_id", "post_id", "reporter_id") NULLS NOT DISTINCT;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "forum_reports_open_idx" ON "forum_reports" ("status", "created_at");--> statement-breakpoint
ALTER TABLE "homework_submissions" ADD COLUMN IF NOT EXISTS "similarity_pct" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "homework_submissions" ADD COLUMN IF NOT EXISTS "rubric_selections" jsonb;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lms_settings" (
  "tenant_id" uuid PRIMARY KEY NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['lms_quiz_events', 'lms_live_sessions', 'lms_live_joins', 'forum_reports', 'lms_settings'] LOOP
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
